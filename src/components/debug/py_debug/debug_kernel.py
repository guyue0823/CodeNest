#!/usr/bin/env python
import sys
import json
import traceback
import threading
import queue
import os
import io


class OutputRedirector:
    """用于重定向 stdout/stderr 并捕获输出"""
    def __init__(self, original_stream, send_func):
        self.original_stream = original_stream
        self.send_func = send_func
        self.buffer = io.StringIO()
    
    def write(self, data):
        self.buffer.write(data)
        
        if '\n' in data:
            lines = self.buffer.getvalue().split('\n')
            self.buffer = io.StringIO()
            for line in lines[:-1]:
                if line:
                    self.send_func(line)
            if lines[-1]:
                self.buffer.write(lines[-1])
    
    def flush(self):
        remaining = self.buffer.getvalue()
        if remaining:
            self.send_func(remaining)
            self.buffer = io.StringIO()


class Debugger:
    def __init__(self, target_file):
        self.target_file = target_file
        self.breakpoints = {}
        self.paused = False
        self.current_frame = None
        self.current_line = 0
        self.current_file = ""
        self.command_queue = queue.Queue()
        self.should_exit = False
        self.step_mode = None
        self.run_to_end = False
        
        self.original_stdout = sys.stdout
        self.original_stderr = sys.stderr

    def send_message(self, msg_type, data=None):
        message = {"type": msg_type, "data": data or {}}
        print(json.dumps(message, ensure_ascii=False, default=str), flush=True, file=self.original_stdout)

    def read_commands(self):
        while not self.should_exit:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                command = json.loads(line.strip())
                self.command_queue.put(command)
            except Exception as e:
                self.send_message("error", {"message": "Error reading command: " + str(e)})

    def get_locals(self, frame):
        result = {}
        for key, value in frame.f_locals.items():
            try:
                result[key] = repr(value)
            except Exception:
                result[key] = "<unrepresentable>"
        return result

    def get_globals(self, frame):
        result = {}
        for key, value in frame.f_globals.items():
            if not key.startswith("__"):
                try:
                    result[key] = repr(value)
                except Exception:
                    result[key] = "<unrepresentable>"
        return result

    def get_call_stack(self, frame):
        stack = []
        f = frame
        while f:
            filename = f.f_code.co_filename
            if os.path.basename(filename) == os.path.basename(self.target_file) or filename == self.target_file:
                stack.append({
                    "filename": filename,
                    "line": f.f_lineno,
                    "function": f.f_code.co_name
                })
            f = f.f_back
        return stack

    def trace_func(self, frame, event, arg):
        if self.should_exit:
            return None

        filename = frame.f_code.co_filename
        if os.path.basename(filename) != os.path.basename(self.target_file) and filename != self.target_file:
            return self.trace_func

        self.current_frame = frame
        self.current_file = filename
        self.current_line = frame.f_lineno

        should_pause = False

        if event == "line" and not self.run_to_end:
            should_pause = self.check_breakpoint(filename, frame.f_lineno)
            
            if not self.breakpoints or len(self.breakpoints) == 0:
                should_pause = True
                self.first_line_break = True
            
            if self.step_mode == "next" or self.step_mode == "step":
                should_pause = True
                self.step_mode = None

        if should_pause:
            self.paused = True
            self.send_paused_state()
            self.wait_for_command()

        return self.trace_func

    def has_breakpoint_after(self, filename, line):
        basename = os.path.basename(filename)
        target_lines = []
        
        if filename in self.breakpoints:
            target_lines = self.breakpoints[filename]
        elif basename in self.breakpoints:
            target_lines = self.breakpoints[basename]
        else:
            for bp_file in self.breakpoints:
                if bp_file in filename or filename in bp_file or os.path.basename(bp_file) == basename:
                    target_lines = self.breakpoints[bp_file]
                    break
        
        for bp_line in target_lines:
            if bp_line > line:
                return True
        
        return False
    
    def check_breakpoint(self, filename, line):
        if filename in self.breakpoints:
            return line in self.breakpoints[filename]
        
        basename = os.path.basename(filename)
        if basename in self.breakpoints:
            return line in self.breakpoints[basename]
        
        for bp_file in self.breakpoints:
            if bp_file in filename or filename in bp_file or os.path.basename(bp_file) == basename:
                return line in self.breakpoints[bp_file]
        
        return False

    def send_paused_state(self):
        self.send_message("paused", {
            "file": self.current_file,
            "line": self.current_line,
            "locals": self.get_locals(self.current_frame),
            "globals": self.get_globals(self.current_frame),
            "callStack": self.get_call_stack(self.current_frame)
        })

    def wait_for_command(self):
        while self.paused and not self.should_exit:
            try:
                command = self.command_queue.get(timeout=0.1)
                self.handle_command(command)
            except queue.Empty:
                continue

    def handle_command(self, command):
        cmd_type = command.get("type")
        
        if cmd_type == "continue":
            self.paused = False
            self.step_mode = "continue"
            
            has_more_breakpoints = self.has_breakpoint_after(self.current_file, self.current_line)
            if not has_more_breakpoints:
                self.run_to_end = True
            else:
                self.run_to_end = False
        elif cmd_type == "next":
            self.paused = False
            self.step_mode = "next"
            self.run_to_end = False
        elif cmd_type == "step":
            self.paused = False
            self.step_mode = "step"
            self.run_to_end = False
        elif cmd_type == "stop":
            self.paused = False
            self.should_exit = True
            sys.exit(0)
        elif cmd_type == "setBreakpoints":
            self.breakpoints = command.get("breakpoints", {})
        elif cmd_type == "evaluate":
            try:
                expr = command.get("expression", "")
                result = eval(expr, self.current_frame.f_globals, self.current_frame.f_locals)
                self.send_message("evaluated", {"result": repr(result)})
            except Exception as e:
                self.send_message("error", {"message": "Evaluation error: " + str(e)})

    def send_stdout_line(self, line):
        self.send_message("stdout", {"text": line})
    
    def send_stderr_line(self, line):
        self.send_message("stderr", {"text": line})
    
    def run(self):
        reader_thread = threading.Thread(target=self.read_commands, daemon=True)
        reader_thread.start()

        original_stdout = sys.stdout
        original_stderr = sys.stderr
        
        stdout_redirector = OutputRedirector(original_stdout, self.send_stdout_line)
        stderr_redirector = OutputRedirector(original_stderr, self.send_stderr_line)
        
        sys.stdout = stdout_redirector
        sys.stderr = stderr_redirector
        
        try:
            sys.settrace(self.trace_func)
            
            try:
                with open(self.target_file, "r", encoding="utf-8") as f:
                    code = compile(f.read(), self.target_file, "exec")
                    exec(code, {"__name__": "__main__"})
            except SystemExit:
                pass
            except Exception as e:
                self.send_message("error", {"message": str(e), "traceback": traceback.format_exc()})
        finally:
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            
            stdout_redirector.flush()
            stderr_redirector.flush()
        
        self.should_exit = True
        self.send_message("exited", {})


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"type": "error", "data": {"message": "No target file specified"}}), flush=True)
        sys.exit(1)
    
    target_file = sys.argv[1]
    debugger = Debugger(target_file)
    
    debugger.send_message("started", {"file": target_file})
    
    debugger.run()


if __name__ == "__main__":
    main()
