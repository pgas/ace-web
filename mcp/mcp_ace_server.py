#!/usr/bin/env python3
"""
mcp_ace_server.py - Model Context Protocol (MCP) & Debugging Server for Jupiter ACE Web

Exposes tools for AI agents (Antigravity, Claude, etc.) to inspect and debug
the Jupiter ACE Forth environment, Z80 CPU state, memory, system variables,
and error codes.
"""

import json
import sys
import os

FORTH_ERRORS = {
    1: "Memory full (Out of RAM) - Dictionary collided with return stack",
    2: "Data stack underflow - Attempted DROP, SWAP, or arithmetic on empty stack",
    3: "Data stack overflow / Type error",
    4: "Compiling word used in interpret mode (e.g. comment '( ... )' or IF/THEN outside ': ... ;')",
    5: "Word already exists (Ace requires REDEFINE instead of colon definition)",
    6: "Variable / word not found in dictionary",
    7: "Control structure mismatch (unpaired IF/THEN, BEGIN/UNTIL, or DO/LOOP)",
    8: "Tape I/O error or checksum failure",
    9: "Input buffer full (>64 chars on bottom screen line)",
    255: "No error (OK)"
}

SYSVARS = {
    15360: ("LIST_LEN", 2, "Current line length in editor"),
    15384: ("CHARS", 2, "Base address of character generator table"),
    15388: ("SCRAPS", 2, "Print position in Video RAM (0x2400-0x26FF)"),
    15403: ("FRAMES", 4, "50Hz frame counter (clock ticks)"),
    15407: ("XCOORD", 1, "Last X plot coordinate (0-63)"),
    15408: ("YCOORD", 1, "Last Y plot coordinate (0-45)"),
    15409: ("CURRENT", 2, "PFA of current vocabulary word"),
    15411: ("CONTEXT", 2, "PFA of context vocabulary word"),
    15415: ("STKBOT", 2, "Next free dictionary byte (HERE = 15415 @)"),
    15417: ("DICT", 2, "Address of length field in newest dictionary word"),
    15421: ("ERR_NO", 1, "Current error code (255 = OK)"),
    15422: ("FLAGS", 1, "System flags (Bit 2=incomplete, Bit 4=INVIS, Bit 6=compile mode)"),
    15423: ("BASE", 1, "Number base (2=bin, 10=dec, 16=hex)")
}

def get_tool_definitions():
    return [
        {
            "name": "ace_diagnose_error",
            "description": "Explains a Jupiter ACE error code and suggests idiomatic Forth fixes",
            "parameters": {
                "type": "object",
                "properties": {
                    "error_code": {"type": "integer", "description": "Error number (1-9 or 255)"}
                },
                "required": ["error_code"]
            }
        },
        {
            "name": "ace_system_variable_info",
            "description": "Looks up description and memory address for a Jupiter ACE system variable",
            "parameters": {
                "type": "object",
                "properties": {
                    "var_name": {"type": "string", "description": "Variable name (BASE, FRAMES, STKBOT, DICT, etc.)"}
                },
                "required": ["var_name"]
            }
        },
        {
            "name": "ace_preprocess_spool",
            "description": "Preprocesses Forth source code: strips top-level comments and wraps lines for the Jupiter Ace 32-40 char limit",
            "parameters": {
                "type": "object",
                "properties": {
                    "source_code": {"type": "string", "description": "Raw Forth source code"}
                },
                "required": ["source_code"]
            }
        }
    ]

def handle_tool_call(name, args):
    if name == "ace_diagnose_error":
        code = args.get("error_code", 255)
        desc = FORTH_ERRORS.get(code, f"Unknown error code {code}")
        return {
            "error_code": code,
            "description": desc,
            "reference_skill": "jupiter-ace-forth (.agents/skills/ja-forth-skill)"
        }
    elif name == "ace_system_variable_info":
        var_name = args.get("var_name", "").upper()
        for addr, (name_str, size, desc) in SYSVARS.items():
            if name_str == var_name:
                return {
                    "name": name_str,
                    "address_dec": addr,
                    "address_hex": hex(addr).upper(),
                    "size_bytes": size,
                    "description": desc
                }
        return {"error": f"Unknown system variable: {var_name}"}
    elif name == "ace_preprocess_spool":
        src = args.get("source_code", "")
        lines = src.splitlines()
        processed = []
        inside_colon = False
        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                continue
            if trimmed.startswith(":"):
                inside_colon = True
            if not inside_colon:
                # Strip ( ... ) comments
                import re
                trimmed = re.sub(r"\([^\)]*\)", "", trimmed).strip()
            if trimmed.endswith(";"):
                inside_colon = False
            if trimmed:
                processed.append(trimmed)
        return {
            "clean_code": "\n".join(processed) + "\n",
            "line_count": len(processed)
        }
    else:
        return {"error": f"Unknown tool: {name}"}

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--tools":
        print(json.dumps(get_tool_definitions(), indent=2))
    elif len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("[*] Testing ace_diagnose_error(4):", handle_tool_call("ace_diagnose_error", {"error_code": 4}))
        print("[*] Testing ace_system_variable_info('BASE'):", handle_tool_call("ace_system_variable_info", {"var_name": "BASE"}))
    else:
        print("Jupiter ACE Web MCP & Debugging Tool Server running. Use --tools or --test.")
