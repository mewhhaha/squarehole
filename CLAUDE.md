# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@mewhhaha/squarehole is a TypeScript web router designed exclusively for Cloudflare Workers, emphasizing simplicity, vendor-friendliness, and runtime performance. It features a custom JSX runtime, file-system based routing, and streaming HTML responses.

## Development Commands

### Core Package (packages/router)
The core router package has no build commands - it's consumed directly as TypeScript.

## Architecture

### Router Core (src/router.mts)
- Routes are `[URLPattern, fragments[]]` tuples
- Sequential matching - first pattern match wins
- Fragment-based architecture with nested components
- Leaf resolution priority: `default` export → `loader` → `action` → 404
- Parallel loader execution for performance
- Streaming HTML responses using TransformStream

### Custom JSX Runtime (src/runtime/jsx-runtime.mts)
- Zero-dependency implementation
- Streaming-first with async generators
- Automatic HTML escaping for XSS protection
- Void element handling for HTML5 compliance

### File-System Routing (src/fs-routes/)
- Converts file paths to URL patterns
- Dynamic parameters: `$param.tsx`
- Optional segments: `(optional).tsx`
- Catch-all routes: `$.tsx`

## Development Guidelines

### Core Principles
- **Simplicity** over abstraction
- **Zero runtime dependencies**
- **Cloudflare Workers only** - Web Standard APIs
- **ES Modules** with `.mts` extensions

### Coding Standards
- Prefer `for-loops` over functional array methods
- Prefer `if/else` over ternary operators
- Use browser built-ins (`URLPattern`, `Request`, `Response`)
- Explicit TypeScript types for public APIs
- Keep functions small and composable

### Security
- All HTML text is escaped during render
- Attribute values are quote-escaped
- Never trust loader/action output implicitly

## Technology Stack
- TypeScript 5.8+ with strict mode
- Cloudflare Workers runtime
- Custom JSX runtime (no React)
- Native Web APIs
- Wrangler for deployment
