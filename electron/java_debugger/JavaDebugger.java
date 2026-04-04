
import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

public class JavaDebugger {
    private VirtualMachine vm;
    private EventRequestManager erm;
    private PrintWriter stdout;
    private BufferedReader stdin;
    private String targetClassName;
    private int[] breakpoints;
    private boolean isPaused = false;
    private BlockingQueue<String> commandQueue;
    private Thread commandReaderThread;
    private StepRequest currentStepRequest;
    private ThreadReference currentThread;

    public static void main(String[] args) {
        try {
            if (args.length < 2) {
                System.err.println("Usage: JavaDebugger <className> <port> [breakpointLines...]");
                System.exit(1);
            }

            String className = args[0];
            int port = Integer.parseInt(args[1]);
            
            int[] bps = new int[args.length - 2];
            for (int i = 2; i < args.length; i++) {
                bps[i - 2] = Integer.parseInt(args[i]);
            }

            JavaDebugger debugger = new JavaDebugger(className, bps);
            debugger.start();
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    public JavaDebugger(String targetClassName, int[] breakpoints) {
        this.targetClassName = targetClassName;
        this.breakpoints = breakpoints;
        this.stdout = new PrintWriter(System.out, true);
        this.stdin = new BufferedReader(new InputStreamReader(System.in));
        this.commandQueue = new LinkedBlockingQueue<String>();
    }

    public void start() throws Exception {
        launchVM();
        startCommandReader();
        setupEventRequests();
        processEvents();
    }

    private void launchVM() throws Exception {
        VirtualMachineManager vmm = Bootstrap.virtualMachineManager();
        LaunchingConnector connector = null;
        
        for (Connector c : vmm.launchingConnectors()) {
            if (c.name().equals("com.sun.jdi.CommandLineLaunch")) {
                connector = (LaunchingConnector) c;
                break;
            }
        }
        
        if (connector == null) {
            throw new Exception("Cannot find CommandLineLaunch connector");
        }
        
        Map<String, Connector.Argument> arguments = connector.defaultArguments();
        arguments.get("main").setValue(targetClassName);
        arguments.get("options").setValue("-cp .");
        arguments.get("suspend").setValue("true");
        
        vm = connector.launch(arguments);
        erm = vm.eventRequestManager();
        
        Process process = vm.process();
        redirectProcessOutput(process);
    }

    private void redirectProcessOutput(Process process) {
        Thread stdoutThread = new Thread(new Runnable() {
            public void run() {
                try {
                    InputStream is = process.getInputStream();
                    byte[] buffer = new byte[1024];
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        String output = new String(buffer, 0, bytesRead);
                        stdout.print(output);
                        stdout.flush();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        });
        stdoutThread.setDaemon(true);
        stdoutThread.start();

        Thread stderrThread = new Thread(new Runnable() {
            public void run() {
                try {
                    InputStream is = process.getErrorStream();
                    byte[] buffer = new byte[1024];
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        String output = new String(buffer, 0, bytesRead);
                        stdout.print(output);
                        stdout.flush();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        });
        stderrThread.setDaemon(true);
        stderrThread.start();
    }

    private void startCommandReader() {
        commandReaderThread = new Thread(new Runnable() {
            public void run() {
                try {
                    String line;
                    while ((line = stdin.readLine()) != null) {
                        commandQueue.put(line.trim());
                    }
                } catch (Exception e) {
                }
            }
        });
        commandReaderThread.setDaemon(true);
        commandReaderThread.start();
    }

    private void setupEventRequests() {
        ClassPrepareRequest classPrepareReq = erm.createClassPrepareRequest();
        classPrepareReq.addClassFilter(targetClassName);
        classPrepareReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        classPrepareReq.enable();
        
        vm.resume();
    }

    private void setupBreakpoints(ReferenceType refType) {
        if (breakpoints != null && breakpoints.length > 0) {
            for (int i = 0; i < breakpoints.length; i++) {
                int line = breakpoints[i];
                try {
                    Location loc = findLocation(refType, line);
                    if (loc != null) {
                        BreakpointRequest bpr = erm.createBreakpointRequest(loc);
                        bpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        bpr.enable();
                    }
                } catch (Exception e) {
                }
            }
        }
    }

    private Location findLocation(ReferenceType refType, int lineNumber) {
        try {
            for (Method method : refType.methods()) {
                for (Location loc : method.allLineLocations()) {
                    if (loc.lineNumber() == lineNumber) {
                        return loc;
                    }
                }
            }
        } catch (AbsentInformationException e) {
        }
        return null;
    }

    private void processEvents() {
        EventQueue queue = vm.eventQueue();
        
        while (true) {
            try {
                EventSet eventSet = queue.remove();
                EventIterator it = eventSet.eventIterator();
                
                while (it.hasNext()) {
                    Event event = it.nextEvent();
                    handleEvent(event);
                }
                
                if (isPaused) {
                    waitForCommandAndResume(eventSet);
                } else {
                    eventSet.resume();
                }
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void waitForCommandAndResume(EventSet eventSet) {
        try {
            while (isPaused) {
                String command = commandQueue.poll();
                if (command != null) {
                    handleCommand(command, eventSet);
                }
                Thread.sleep(50);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void handleCommand(String command, EventSet eventSet) {
        if (currentStepRequest != null) {
            currentStepRequest.disable();
            currentStepRequest = null;
        }
        
        switch (command) {
            case "CONTINUE":
                isPaused = false;
                eventSet.resume();
                break;
                
            case "STEP_OVER":
                isPaused = false;
                createStepRequest(StepRequest.STEP_LINE, StepRequest.STEP_OVER);
                eventSet.resume();
                break;
                
            case "STEP_INTO":
                isPaused = false;
                createStepRequest(StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                eventSet.resume();
                break;
                
            case "STEP_OUT":
                isPaused = false;
                createStepRequest(StepRequest.STEP_LINE, StepRequest.STEP_OUT);
                eventSet.resume();
                break;
        }
    }

    private void createStepRequest(int size, int depth) {
        currentStepRequest = erm.createStepRequest(
            currentThread,
            size,
            depth
        );
        currentStepRequest.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        currentStepRequest.addCountFilter(1);
        currentStepRequest.enable();
    }

    private void handleEvent(Event event) {
        if (event instanceof ClassPrepareEvent) {
            handleClassPrepareEvent((ClassPrepareEvent) event);
        } else if (event instanceof BreakpointEvent) {
            handleBreakpointEvent((BreakpointEvent) event);
        } else if (event instanceof StepEvent) {
            handleStepEvent((StepEvent) event);
        } else if (event instanceof VMStartEvent) {
        } else if (event instanceof VMDeathEvent) {
            System.exit(0);
        }
    }

    private void handleClassPrepareEvent(ClassPrepareEvent event) {
        ReferenceType refType = event.referenceType();
        
        if (refType.name().equals(targetClassName)) {
            setupBreakpoints(refType);
        }
    }

    private void handleBreakpointEvent(BreakpointEvent event) {
        Location loc = event.location();
        int line = loc.lineNumber();
        
        if (!isPaused) {
            currentThread = event.thread();
            isPaused = true;
            sendPauseSignal(line);
        }
    }

    private void handleStepEvent(StepEvent event) {
        Location loc = event.location();
        int line = loc.lineNumber();
        
        if (currentStepRequest != null) {
            currentStepRequest.disable();
            currentStepRequest = null;
        }
        
        if (!isPaused) {
            currentThread = event.thread();
            isPaused = true;
            sendPauseSignal(line);
        }
    }

    private String getValueString(Value value) {
        if (value == null) {
            return "null";
        }
        
        if (value instanceof PrimitiveValue) {
            PrimitiveValue pv = (PrimitiveValue) value;
            if (pv instanceof BooleanValue) {
                return Boolean.toString(((BooleanValue) pv).value());
            } else if (pv instanceof ByteValue) {
                return Byte.toString(((ByteValue) pv).value());
            } else if (pv instanceof CharValue) {
                return "'" + ((CharValue) pv).value() + "'";
            } else if (pv instanceof DoubleValue) {
                return Double.toString(((DoubleValue) pv).value());
            } else if (pv instanceof FloatValue) {
                return Float.toString(((FloatValue) pv).value());
            } else if (pv instanceof IntegerValue) {
                return Integer.toString(((IntegerValue) pv).value());
            } else if (pv instanceof LongValue) {
                return Long.toString(((LongValue) pv).value());
            } else if (pv instanceof ShortValue) {
                return Short.toString(((ShortValue) pv).value());
            }
        } else if (value instanceof StringReference) {
            return "\"" + ((StringReference) value).value() + "\"";
        } else if (value instanceof ArrayReference) {
            return "Array[" + ((ArrayReference) value).length() + "]";
        } else if (value instanceof ObjectReference) {
            return value.type().name();
        }
        
        return value.toString();
    }

    private void sendPauseSignal(int line) {
        stdout.println("<<<PAUSED>>>");
        stdout.println("<<<LINE:" + line + ">>>");
        stdout.println("<<<CLASS:" + targetClassName + ">>>");
        
        try {
            if (currentThread != null) {
                List<StackFrame> frames = currentThread.frames();
                
                if (frames.size() > 0) {
                    stdout.println("<<<CALLSTACK_START>>>");
                    for (int i = 0; i < frames.size(); i++) {
                        StackFrame frame = frames.get(i);
                        Location loc = frame.location();
                        Method method = loc.method();
                        String methodName = method.name();
                        String className = method.declaringType().name();
                        int frameLine = loc.lineNumber();
                        stdout.println(className + "." + methodName + ":" + frameLine);
                    }
                    stdout.println("<<<CALLSTACK_END>>>");
                    
                    StackFrame topFrame = frames.get(0);
                    stdout.println("<<<LOCAL_VARS_START>>>");
                    try {
                        List<LocalVariable> visibleVariables = topFrame.visibleVariables();
                        for (LocalVariable var : visibleVariables) {
                            Value value = topFrame.getValue(var);
                            stdout.println(var.name() + "=" + getValueString(value));
                        }
                    } catch (AbsentInformationException e) {
                    }
                    stdout.println("<<<LOCAL_VARS_END>>>");
                    
                    stdout.println("<<<THIS_START>>>");
                    ObjectReference thisObj = topFrame.thisObject();
                    if (thisObj != null) {
                        ReferenceType refType = thisObj.referenceType();
                        List<Field> fields = refType.allFields();
                        for (Field field : fields) {
                            Value value = thisObj.getValue(field);
                            stdout.println(field.name() + "=" + getValueString(value));
                        }
                    }
                    stdout.println("<<<THIS_END>>>");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        stdout.flush();
    }
}

