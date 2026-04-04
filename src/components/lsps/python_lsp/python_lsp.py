#!/usr/bin/env python3
import sys
import json
import inspect
import ast
import builtins
import keyword
from typing import List, Dict, Any, Optional, Tuple
import threading
import re


class Symbol:
    def __init__(self, name: str, symbol_type: str, scope: str = "global", 
                 node: Any = None, params: List[str] = None, 
                 return_type: str = None, documentation: str = None):
        self.name = name
        self.symbol_type = symbol_type
        self.scope = scope
        self.node = node
        self.params = params or []
        self.return_type = return_type
        self.documentation = documentation
        self.line = getattr(node, 'lineno', 0) if node else 0
        self.column = getattr(node, 'col_offset', 0) if node else 0


class SymbolTable:
    def __init__(self):
        self.global_symbols: Dict[str, List[Symbol]] = {}
        self.function_scopes: Dict[str, Dict[str, List[Symbol]]] = {}
        self.current_function: Optional[str] = None
        
    def add_symbol(self, symbol: Symbol) -> None:
        if symbol.scope == "global":
            if symbol.name not in self.global_symbols:
                self.global_symbols[symbol.name] = []
            self.global_symbols[symbol.name].append(symbol)
        else:
            if symbol.scope not in self.function_scopes:
                self.function_scopes[symbol.scope] = {}
            if symbol.name not in self.function_scopes[symbol.scope]:
                self.function_scopes[symbol.scope][symbol.name] = []
            self.function_scopes[symbol.scope][symbol.name].append(symbol)
    
    def find_symbol(self, name: str, function_scope: Optional[str] = None) -> Optional[Symbol]:
        if function_scope and function_scope in self.function_scopes:
            if name in self.function_scopes[function_scope]:
                return self.function_scopes[function_scope][name][-1]
        if name in self.global_symbols:
            return self.global_symbols[name][-1]
        return None
    
    def get_all_symbols(self) -> List[Symbol]:
        symbols = []
        for name_list in self.global_symbols.values():
            symbols.extend(name_list)
        for scope in self.function_scopes.values():
            for name_list in scope.values():
                symbols.extend(name_list)
        return symbols


class PythonLSP:
    def __init__(self):
        self.document_cache: Dict[str, str] = {}
        self.module_cache: Dict[str, Any] = {}
        self.symbol_tables: Dict[str, SymbolTable] = {}
        self.builtins_names = dir(builtins)
        self.keywords = keyword.kwlist

    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        method = request.get("method")
        params = request.get("params", {})
        
        handlers = {
            "initialize": self.handle_initialize,
            "textDocument/didOpen": self.handle_did_open,
            "textDocument/didChange": self.handle_did_change,
            "textDocument/completion": self.handle_completion,
            "textDocument/signatureHelp": self.handle_signature_help,
            "textDocument/diagnostic": self.handle_diagnostic,
            "shutdown": self.handle_shutdown,
        }
        
        if method in handlers:
            return handlers[method](params)
        return {"error": f"Unknown method: {method}"}

    def handle_initialize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "capabilities": {
                "completionProvider": {
                    "triggerCharacters": [".", "("],
                    "resolveProvider": True,
                },
                "signatureHelpProvider": {
                    "triggerCharacters": ["(", ","],
                },
                "textDocumentSync": 2,
            }
        }

    def handle_did_open(self, params: Dict[str, Any]) -> Dict[str, Any]:
        uri = params.get("textDocument", {}).get("uri")
        text = params.get("textDocument", {}).get("text")
        if uri and text:
            self.document_cache[uri] = text
            self._build_symbol_table(uri, text)
        return {"result": "ok"}

    def handle_did_change(self, params: Dict[str, Any]) -> Dict[str, Any]:
        uri = params.get("textDocument", {}).get("uri")
        content_changes = params.get("contentChanges", [])
        if uri and content_changes:
            text = content_changes[-1].get("text", "")
            self.document_cache[uri] = text
            self._build_symbol_table(uri, text)
        return {"result": "ok"}
    
    def _build_symbol_table(self, uri: str, text: str) -> None:
        symbol_table = SymbolTable()
        try:
            tree = ast.parse(text)
            
            class SymbolVisitor(ast.NodeVisitor):
                def __init__(self, st: SymbolTable):
                    self.st = st
                    self.current_function: Optional[str] = None
                    self.imported_names: set = set()
                    
                def visit_Import(self, node):
                    for name in node.names:
                        alias = name.asname if name.asname else name.name
                        self.imported_names.add(alias)
                        symbol = Symbol(
                            name=alias,
                            symbol_type="import",
                            scope="global",
                            node=node
                        )
                        self.st.add_symbol(symbol)
                    self.generic_visit(node)
                    
                def visit_ImportFrom(self, node):
                    module_name = node.module or ""
                    for name in node.names:
                        alias = name.asname if name.asname else name.name
                        self.imported_names.add(alias)
                        symbol = Symbol(
                            name=alias,
                            symbol_type="import",
                            scope="global",
                            node=node
                        )
                        self.st.add_symbol(symbol)
                    self.generic_visit(node)
                    
                def visit_FunctionDef(self, node):
                    params = [arg.arg for arg in node.args.args]
                    docstring = ast.get_docstring(node) or ""
                    symbol = Symbol(
                        name=node.name,
                        symbol_type="function",
                        scope="global",
                        node=node,
                        params=params,
                        documentation=docstring
                    )
                    self.st.add_symbol(symbol)
                    
                    old_function = self.current_function
                    self.current_function = node.name
                    
                    for arg in node.args.args:
                        param_symbol = Symbol(
                            name=arg.arg,
                            symbol_type="parameter",
                            scope=node.name,
                            node=arg
                        )
                        self.st.add_symbol(param_symbol)
                    
                    self.generic_visit(node)
                    self.current_function = old_function
                    
                def visit_ClassDef(self, node):
                    docstring = ast.get_docstring(node) or ""
                    symbol = Symbol(
                        name=node.name,
                        symbol_type="class",
                        scope="global",
                        node=node,
                        documentation=docstring
                    )
                    self.st.add_symbol(symbol)
                    self.generic_visit(node)
                    
                def visit_Assign(self, node):
                    scope = self.current_function or "global"
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            symbol = Symbol(
                                name=target.id,
                                symbol_type="variable",
                                scope=scope,
                                node=node
                            )
                            self.st.add_symbol(symbol)
                    self.generic_visit(node)
                    
                def visit_AnnAssign(self, node):
                    scope = self.current_function or "global"
                    if isinstance(node.target, ast.Name):
                        symbol = Symbol(
                            name=node.target.id,
                            symbol_type="variable",
                            scope=scope,
                            node=node
                        )
                        self.st.add_symbol(symbol)
                    self.generic_visit(node)
            
            visitor = SymbolVisitor(symbol_table)
            visitor.visit(tree)
        except Exception as e:
            pass
        
        self.symbol_tables[uri] = symbol_table



    def handle_completion(self, params: Dict[str, Any]) -> Dict[str, Any]:
        uri = params.get("textDocument", {}).get("uri")
        position = params.get("position", {})
        text = self.document_cache.get(uri, "")
        
        line = position.get("line", 0)
        character = position.get("character", 0)
        
        lines = text.split("\n")
        if line >= len(lines):
            return {"items": []}
        
        current_line = lines[line]
        prefix = current_line[:character]
        
        completion_items = []
        
        is_import = prefix.strip().startswith("import ") or prefix.strip().startswith("from ")
        
        if is_import:
            import_partial = prefix.split()[-1] if prefix.split() else ""
            if "." in import_partial:
                import_parts = import_partial.split(".")
                module_name = ".".join(import_parts[:-1])
                partial = import_parts[-1]
                completion_items.extend(self._get_submodule_completions(module_name, partial))
            else:
                partial = import_partial
                completion_items.extend(self._get_global_completions(text, partial))
        else:
            match = re.search(r'([\w\.]+)$', prefix)
            if match and "." in match.group(1):
                last_part = match.group(1)
                parts = last_part.split(".")
                obj_name = ".".join(parts[:-1])
                partial = parts[-1]
                completion_items.extend(self._get_attribute_completions(text, obj_name, partial))
            else:
                partial = prefix.split()[-1] if prefix.split() else ""
                completion_items.extend(self._get_global_completions(text, partial))
        
        return {"items": completion_items}
    
    def _get_submodule_completions(self, module_name: str, partial: str) -> List[Dict[str, Any]]:
        items = []
        try:
            if "." in module_name:
                parts = module_name.split(".")
                module = __import__(parts[0], fromlist=[""])
                current_obj = module
                for part in parts[1:]:
                    current_obj = getattr(current_obj, part)
            else:
                module = __import__(module_name, fromlist=[""])
                current_obj = module
            
            attrs = dir(current_obj)
            for attr in attrs:
                if attr.startswith(partial) and not attr.startswith("_"):
                    try:
                        attr_obj = getattr(current_obj, attr)
                        kind = 9 if inspect.ismodule(attr_obj) else self._get_kind(attr, current_obj)
                        items.append({
                            "label": attr,
                            "kind": kind,
                            "detail": type(attr_obj).__name__,
                            "sortText": f"0_{attr}"
                        })
                    except:
                        items.append({
                            "label": attr,
                            "kind": 6,
                            "detail": "attribute",
                            "sortText": f"0_{attr}"
                        })
        except Exception as e:
            pass
        
        return items

    def _get_global_completions(self, text: str, partial: str) -> List[Dict[str, Any]]:
        items = []
        
        for name in self.builtins_names:
            if name.startswith(partial) and not name.startswith("_"):
                kind = self._get_kind(name, builtins)
                items.append({
                    "label": name,
                    "kind": kind,
                    "detail": "built-in",
                    "sortText": f"0_{name}"
                })
        
        for kw in self.keywords:
            if kw.startswith(partial):
                items.append({
                    "label": kw,
                    "kind": 14,
                    "detail": "keyword",
                    "sortText": f"1_{kw}"
                })
        
        items.extend(self._get_local_definitions(text, partial, "2_"))
        
        try:
            for name in sys.builtin_module_names:
                if name.startswith(partial) and not name.startswith("_"):
                    items.append({
                        "label": name,
                        "kind": 9,
                        "detail": "stdlib module",
                        "sortText": f"3_{name}"
                    })
        except:
            pass
        
        return items

    def _get_attribute_completions(self, text: str, obj_name: str, partial: str) -> List[Dict[str, Any]]:
        items = []
        
        obj_type = self._infer_type(text, obj_name)
        
        if obj_type:
            try:
                attrs = dir(obj_type)
                for attr in attrs:
                    if attr.startswith(partial) and not attr.startswith("_"):
                        try:
                            attr_obj = getattr(obj_type, attr, None)
                            kind = self._get_kind(attr, obj_type)
                            items.append({
                                "label": attr,
                                "kind": kind,
                                "detail": type(attr_obj).__name__,
                                "sortText": f"0_{attr}"
                            })
                        except:
                            items.append({
                                "label": attr,
                                "kind": 6,
                                "detail": "attribute",
                                "sortText": f"0_{attr}"
                            })
            except:
                pass
        
        if not items:
            items.extend(self._get_string_completions(partial))
            items.extend(self._get_list_completions(partial))
            items.extend(self._get_dict_completions(partial))
        
        return items

    def _infer_type(self, text: str, name: str):
        type_map = {
            "str": str,
            "list": list,
            "dict": dict,
            "tuple": tuple,
            "set": set,
            "int": int,
            "float": float,
            "bool": bool,
        }
        
        if name in type_map:
            return type_map[name]
        
        try:
            if "." in name:
                parts = name.split(".")
                module = __import__(parts[0], fromlist=[""])
                current_obj = module
                for part in parts[1:]:
                    current_obj = getattr(current_obj, part)
                return current_obj
            else:
                module = __import__(name, fromlist=[""])
                return module
        except Exception as e:
            pass
        
        return None

    def _get_kind(self, name: str, obj: Any) -> int:
        try:
            attr = getattr(obj, name, None)
            if inspect.isclass(attr):
                return 7
            elif inspect.isfunction(attr) or inspect.ismethod(attr):
                return 3
            elif inspect.ismodule(attr):
                return 9
            else:
                return 6
        except:
            return 6

    def _get_string_completions(self, partial: str) -> List[Dict[str, Any]]:
        string_methods = [
            "capitalize", "casefold", "center", "count", "encode", "endswith",
            "expandtabs", "find", "format", "format_map", "index", "isalnum",
            "isalpha", "isascii", "isdecimal", "isdigit", "isidentifier", "islower",
            "isnumeric", "isprintable", "isspace", "istitle", "isupper", "join",
            "ljust", "lower", "lstrip", "maketrans", "partition", "replace",
            "rfind", "rindex", "rjust", "rpartition", "rsplit", "rstrip",
            "split", "splitlines", "startswith", "strip", "swapcase", "title",
            "translate", "upper", "zfill"
        ]
        items = []
        for method in string_methods:
            if method.startswith(partial):
                items.append({
                    "label": method,
                    "kind": 2,
                    "detail": "str method",
                    "sortText": f"a_{method}"
                })
        return items

    def _get_list_completions(self, partial: str) -> List[Dict[str, Any]]:
        list_methods = [
            "append", "clear", "copy", "count", "extend", "index", "insert",
            "pop", "remove", "reverse", "sort"
        ]
        items = []
        for method in list_methods:
            if method.startswith(partial):
                items.append({
                    "label": method,
                    "kind": 2,
                    "detail": "list method",
                    "sortText": f"a_{method}"
                })
        return items

    def _get_dict_completions(self, partial: str) -> List[Dict[str, Any]]:
        dict_methods = [
            "clear", "copy", "fromkeys", "get", "items", "keys", "pop",
            "popitem", "setdefault", "update", "values"
        ]
        items = []
        for method in dict_methods:
            if method.startswith(partial):
                items.append({
                    "label": method,
                    "kind": 2,
                    "detail": "dict method",
                    "sortText": f"a_{method}"
                })
        return items

    def _parse_local_definitions(self, text: str) -> Dict[str, Dict[str, Any]]:
        definitions = {}
        try:
            tree = ast.parse(text)
            
            class DefinitionVisitor(ast.NodeVisitor):
                def __init__(self):
                    self.defs = {}
                
                def visit_FunctionDef(self, node):
                    self.defs[node.name] = {"type": "function", "node": node}
                    self.generic_visit(node)
                
                def visit_ClassDef(self, node):
                    self.defs[node.name] = {"type": "class", "node": node}
                    self.generic_visit(node)
                
                def visit_Assign(self, node):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            self.defs[target.id] = {"type": "variable", "node": node}
                    self.generic_visit(node)
                
                def visit_AnnAssign(self, node):
                    if isinstance(node.target, ast.Name):
                        self.defs[node.target.id] = {"type": "variable", "node": node}
                    self.generic_visit(node)
            
            visitor = DefinitionVisitor()
            visitor.visit(tree)
            definitions = visitor.defs
        except:
            pass
        return definitions

    def _get_local_definitions(self, text: str, partial: str, sort_prefix: str) -> List[Dict[str, Any]]:
        items = []
        definitions = self._parse_local_definitions(text)
        
        for name, info in definitions.items():
            if name.startswith(partial):
                kind = 12
                if info["type"] == "function":
                    kind = 3
                elif info["type"] == "class":
                    kind = 7
                elif info["type"] == "variable":
                    kind = 6
                items.append({
                    "label": name,
                    "kind": kind,
                    "detail": info["type"],
                    "sortText": f"{sort_prefix}{name}"
                })
        return items

    def handle_signature_help(self, params: Dict[str, Any]) -> Dict[str, Any]:
        uri = params.get("textDocument", {}).get("uri")
        position = params.get("position", {})
        text = self.document_cache.get(uri, "")
        
        line = position.get("line", 0)
        character = position.get("character", 0)
        
        lines = text.split("\n")
        if line >= len(lines):
            return {"signatures": []}
        
        current_line = lines[line]
        prefix = current_line[:character]
        
        signatures = []
        
        func_name = self._extract_function_name(prefix)
        if func_name:
            signatures.extend(self._get_function_signatures(text, func_name))
        
        return {
            "signatures": signatures,
            "activeSignature": 0,
            "activeParameter": self._get_active_parameter(prefix)
        }

    def _extract_function_name(self, text: str) -> Optional[str]:
        match = re.search(r'(\w+)\s*\($', text)
        if match:
            return match.group(1)
        
        match = re.search(r'(\w+)\.\s*(\w+)\s*\($', text)
        if match:
            return match.group(2)
        return None

    def _get_function_signatures(self, text: str, func_name: str) -> List[Dict[str, Any]]:
        sigs = []
        
        if hasattr(builtins, func_name):
            func = getattr(builtins, func_name)
            if callable(func):
                sigs.append(self._create_signature(func))
        
        local_defs = self._parse_local_definitions(text)
        if func_name in local_defs and local_defs[func_name]["type"] == "function":
            node = local_defs[func_name]["node"]
            sigs.append(self._create_signature_from_ast(node, func_name))
        
        return sigs

    def _create_signature(self, func: Any) -> Dict[str, Any]:
        try:
            sig = inspect.signature(func)
            params = []
            for name, param in sig.parameters.items():
                params.append({"label": name})
            return {
                "label": f"{func.__name__}{sig}",
                "parameters": params,
                "documentation": inspect.getdoc(func) or ""
            }
        except:
            return {
                "label": f"{func.__name__}(...)",
                "parameters": [],
                "documentation": ""
            }

    def _create_signature_from_ast(self, node: ast.FunctionDef, name: str) -> Dict[str, Any]:
        params = []
        for arg in node.args.args:
            params.append({"label": arg.arg})
        
        param_str = ", ".join([p["label"] for p in params])
        return {
            "label": f"{name}({param_str})",
            "parameters": params,
            "documentation": ast.get_docstring(node) or ""
        }

    def _get_active_parameter(self, text: str) -> int:
        open_paren = text.rfind("(")
        if open_paren == -1:
            return 0
        
        param_text = text[open_paren + 1:]
        count = 0
        depth = 0
        for c in param_text:
            if c == ",":
                count += 1
        return count

    def handle_diagnostic(self, params: Dict[str, Any]) -> Dict[str, Any]:
        uri = params.get("textDocument", {}).get("uri")
        text = self.document_cache.get(uri, "")
        
        diagnostics = []
        
        try:
            ast.parse(text)
        except SyntaxError as e:
            diagnostics.append({
                "range": {
                    "start": {"line": e.lineno - 1, "character": e.offset - 1 if e.offset else 0},
                    "end": {"line": e.lineno - 1, "character": e.offset if e.offset else 100}
                },
                "message": str(e),
                "severity": 1,
                "source": "python-lsp"
            })
        
        symbol_table = self.symbol_tables.get(uri)
        if symbol_table:
            diagnostics.extend(self._check_undefined_variables(text, symbol_table))
            diagnostics.extend(self._check_duplicate_definitions(symbol_table))
        
        return {"diagnostics": diagnostics}
    
    def _check_undefined_variables(self, text: str, symbol_table: SymbolTable) -> List[Dict[str, Any]]:
        diagnostics = []
        try:
            tree = ast.parse(text)
            
            class VariableVisitor(ast.NodeVisitor):
                def __init__(self, st: SymbolTable, builtin_names: set):
                    self.st = st
                    self.builtin_names = builtin_names
                    self.current_function: Optional[str] = None
                    self.diagnostics = []
                    
                def visit_FunctionDef(self, node):
                    old_function = self.current_function
                    self.current_function = node.name
                    self.generic_visit(node)
                    self.current_function = old_function
                    
                def visit_Name(self, node):
                    if isinstance(node.ctx, ast.Load):
                        name = node.id
                        if (name not in self.builtin_names and 
                            not keyword.iskeyword(name) and
                            not self.st.find_symbol(name, self.current_function)):
                            self.diagnostics.append({
                                "range": {
                                    "start": {"line": node.lineno - 1, "character": node.col_offset},
                                    "end": {"line": node.lineno - 1, "character": node.col_offset + len(name)}
                                },
                                "message": f"Undefined variable '{name}'",
                                "severity": 1,
                                "source": "python-lsp"
                            })
                    self.generic_visit(node)
            
            builtin_names = set(self.builtins_names)
            visitor = VariableVisitor(symbol_table, builtin_names)
            visitor.visit(tree)
            diagnostics = visitor.diagnostics
        except Exception as e:
            pass
        
        return diagnostics
    
    def _check_duplicate_definitions(self, symbol_table: SymbolTable) -> List[Dict[str, Any]]:
        diagnostics = []
        
        def add_duplicate_diagnostics(symbols: List[Symbol]):
            if len(symbols) > 1:
                sorted_symbols = sorted(symbols, key=lambda s: s.line)
                for i in range(1, len(sorted_symbols)):
                    symbol = sorted_symbols[i]
                    diagnostics.append({
                        "range": {
                            "start": {"line": symbol.line - 1, "character": symbol.column},
                            "end": {"line": symbol.line - 1, "character": symbol.column + len(symbol.name)}
                        },
                        "message": f"Duplicate definition of '{symbol.name}'",
                        "severity": 2,
                        "source": "python-lsp"
                    })
        
        for name, symbols in symbol_table.global_symbols.items():
            add_duplicate_diagnostics(symbols)
        
        for scope_name, scope in symbol_table.function_scopes.items():
            for name, symbols in scope.items():
                add_duplicate_diagnostics(symbols)
        
        return diagnostics

    def handle_shutdown(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return {"result": "ok"}


def main():
    lsp = PythonLSP()
    
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue
            
            request = json.loads(line)
            response = lsp.handle_request(request)
            response["id"] = request.get("id")
            
            print(json.dumps(response), flush=True)
        except Exception as e:
            error_response = {
                "error": {"message": str(e)},
                "id": None
            }
            print(json.dumps(error_response), flush=True)


if __name__ == "__main__":
    main()
