# @mewhhaha/squarehole

A lightweight, performant TypeScript router for Cloudflare Workers with file-based routing, streaming HTML, and a custom JSX runtime.

## Features

- 🚀 **Zero dependencies** - Completely standalone router
- 📁 **File-based routing** - Automatic route generation from your file structure
- 🌊 **Streaming HTML** - First-class support for HTML streaming responses
- ⚛️ **Custom JSX runtime** - Write JSX without React (includes dangerouslySetInnerHTML)
- 🔄 **JSX in loaders** - Use JSX anywhere with toPromise() and toReadableStream()
- 🛠️ **Vite plugin included** - Auto route generation, import.meta fixes, and optimized build config
- 🔥 **Cloudflare Workers optimized** - Built for edge computing
- 🎯 **Type-safe** - Full TypeScript support with great DX
- ⚡ **Fast** - Minimal overhead, maximum performance

## Quick Start

```bash
# Install @mewhhaha/squarehole
pnpm add @mewhhaha/squarehole

# Install development dependencies
pnpm add -D vite @cloudflare/vite-plugin wrangler
```

## Basic Usage

### 1. Create your router

```typescript
// src/index.ts
import { Router } from '@mewhhaha/squarehole';
import { routes } from './routes';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const router = Router(routes);
    return router.handle(request, { env, ctx });
  }
};
```

### 2. Define routes using file-based routing

**Note:** @mewhhaha/squarehole uses flat file-based routing. All route files should be placed directly in the app/routes directory.

```bash
app/
├── _layout.tsx           # Root layout wrapper
├── document.tsx          # Document wrapper
└── routes/
    ├── _index.tsx        # / route
    ├── about.tsx         # /about route
    ├── blog._index.tsx   # /blog route
    ├── blog.$slug.tsx    # /blog/:slug route
    └── api.users.ts      # /api/users route
```

### 3. Create a route component

```tsx
// app/_index.tsx
export default function HomePage() {
  return (
    <html>
      <head>
        <title>Welcome to @mewhhaha/squarehole</title>
        <script
          src="https://cdn.jsdelivr.net/gh/bigskysoftware/fixi@0.9.0/fixi.js"
          crossorigin="anonymous"
          integrity="sha256-0957yKwrGW4niRASx0/UxJxBY/xBhYK63vDCnTF7hH4="
        ></script>
      </head>
      <body>
        <div class="container">
          <h1>Hello, World!</h1>
          <p>Welcome to your new @mewhhaha/squarehole app.</p>
          <button fx-action="/api/click" fx-method="post" fx-target="#result">
            Click me
          </button>
          <div id="result"></div>
        </div>
      </body>
    </html>
  );
}
```

## Examples

### Basic Route with Loader

```tsx
// app/users.tsx
export async function loader({ request, params, context }) {
  const users = await context.env.DB.prepare('SELECT * FROM users').all();
  return { users: users.results };
}

export default function UsersPage({ users }) {
  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Dynamic Routes

```tsx
// app/blog/$slug.tsx
export async function loader({ params }) {
  const post = await getPostBySlug(params.slug);
  if (!post) {
    throw new Response('Not Found', { status: 404 });
  }
  return { post };
}

export default function BlogPost({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

### Form Actions

```tsx
// app/contact.tsx
export async function action({ request, context }) {
  const formData = await request.formData();
  const email = formData.get('email');
  const message = formData.get('message');

  await context.env.DB.prepare(
    'INSERT INTO messages (email, message) VALUES (?, ?)'
  ).bind(email, message).run();

  return Response.redirect('/thank-you');
}

export default function ContactForm() {
  return (
    <form action="/contact" method="POST">
      <input type="email" name="email" required />
      <textarea name="message" required />
      <button type="submit">Send Message</button>
    </form>
  );
}
```

### Dynamic Forms with fixi

```tsx
// app/search.tsx
export default function SearchPage() {
  return (
    <div>
      <h1>Product Search</h1>
      <form fx-action="/api/search" fx-target="#results" fx-trigger="input">
        <input
          type="search"
          name="q"
          placeholder="Search products..."
        />
      </form>
      <div id="results">
        <!-- Results will be loaded here -->
      </div>
    </div>
  );
}

// app/api/search.ts
export async function loader({ request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  const products = await searchProducts(query);

  // Using JSX in loader with toPromise()
  const html = await (
    <>
      {products.map(p => (
        <div class="product">
          <h3>{p.name}</h3>
          <p>${p.price}</p>
          <button fx-action="/api/cart" fx-method="post" data-id={p.id}>
            Add to Cart
          </button>
        </div>
      ))}
    </>
  ).toPromise();

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

### Streaming with Suspense

```tsx
// app/dashboard.tsx
import { Suspense } from '@mewhhaha/squarehole/components';

async function SlowData() {
  const data = await fetch('https://api.slow-endpoint.com/data');
  return <div>{await data.text()}</div>;
}

export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <SlowData />
      </Suspense>
    </div>
  );
}
```

### API Routes

```typescript
// app/api/hello.ts
export async function loader({ request }) {
  return Response.json({ message: 'Hello from API!' });
}

export async function action({ request }) {
  const body = await request.json();
  return Response.json({ received: body });
}
```

### Using JSX in Loaders and Actions

You can use JSX directly in loaders and actions, then convert to string or stream:

```tsx
// app/api/users.tsx
export async function loader({ request }) {
  const users = await getUsers();

  // Option 1: Convert to string with toPromise()
  const html = await (
    <ul>
      {users.map(user => (
        <li>
          <span>{user.name}</span>
          <button fx-action={`/api/users/${user.id}`} fx-method="delete">
            Delete
          </button>
        </li>
      ))}
    </ul>
  ).toPromise();

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// app/api/posts.tsx
export async function loader({ request }) {
  const posts = await getPosts();

  // Option 2: Stream the response with toReadableStream()
  const stream = (
    <div class="posts">
      {posts.map(post => (
        <article>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <a href={`/posts/${post.id}`}>Read more</a>
        </article>
      ))}
    </div>
  ).toReadableStream();

  return new Response(stream, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// app/api/comments.tsx
import { Suspense } from '@mewhhaha/squarehole/components';

export async function loader({ request }) {
  // Option 3: Stream with Suspense for async components
  const stream = (
    <div class="comments">
      <h3>Comments</h3>
      <Suspense fallback={<div>Loading comments...</div>}>
        {async () => {
          const comments = await fetchComments();
          return (
            <>
              {comments.map(comment => (
                <div class="comment">
                  <strong>{comment.author}</strong>
                  <p>{comment.text}</p>
                </div>
              ))}
            </>
          );
        }}
      </Suspense>
    </div>
  ).toReadableStream();

  return new Response(stream, {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

### Layout Wrapper

```tsx
// app/_layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* For production, vendor fixi.js in public/ and use: <script src="/fixi.js"></script> */}
        <script
          src="https://cdn.jsdelivr.net/gh/bigskysoftware/fixi@0.9.0/fixi.js"
          crossorigin="anonymous"
          integrity="sha256-0957yKwrGW4niRASx0/UxJxBY/xBhYK63vDCnTF7hH4="
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Document Wrapper

```tsx
// app/document.tsx
export default function Document({ children, loaderData }) {
  return (
    <div id="app">
      {children}
    </div>
  );
}
```

## Setting Up a Project (Using workers/example)

### 1. Project Structure

```
my-app/
├── app/                    # Application directory
│   ├── _layout.tsx        # Root layout
│   ├── document.tsx       # Document wrapper
│   └── routes/            # All routes (flat structure)
│       ├── _index.tsx     # Home page
│       ├── about.tsx      # /about
│       ├── blog._index.tsx # /blog
│       └── blog.$id.tsx   # /blog/:id
├── public/                # Static assets
│   └── fixi.js           # fixi.js library
├── src/
│   └── index.ts          # Worker entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.toml
```

### 2. Package.json

```json
{
  "name": "my-app",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "deploy": "wrangler deploy",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "eslint app",
    "routes": "fs-routes ./app"
  },
  "dependencies": {
    "@mewhhaha/squarehole": "^1.0.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.7.4",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.8.3",
    "vite": "npm:rolldown-vite@latest",
    "wrangler": "^4.21.0"
  }
}
```

### 3. Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { squarehole } from '@mewhhaha/squarehole/vite-plugin';

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' }
    }),
    squarehole(), // Auto-generates routes and fixes import.meta.url
  ],
  build: {
    target: 'esnext', // Required for Cloudflare Workers
  },
});
```

For optimal Cloudflare Workers performance, we recommend these build settings:

```typescript
// vite.config.ts with recommended build options
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { squarehole } from '@mewhhaha/squarehole/vite-plugin';

export default defineConfig({
  css: {
    modules: false, // Disable CSS modules if using Tailwind
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' }
    }),
    squarehole({
      appFolder: './app',     // Routes directory (default: './app')
      fixImportMeta: true,    // Fix import.meta.url (default: true)
    }),
  ],
  build: {
    target: 'esnext', // Required for modern JS features in Workers
    rollupOptions: {
      experimental: {
        resolveNewUrlToAsset: true, // Enable new URL() asset imports
      },
      resolve: {
        conditionNames: ['import'], // Prefer ESM exports in packages
      },
      moduleTypes: {
        // Convert images to data URLs for easier deployment
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.png': 'dataurl',
        '.gif': 'dataurl',
        '.svg': 'dataurl',
        '.ico': 'dataurl',
      },
    },
  },
});
```

### 4. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "jsxImportSource": "@mewhhaha/squarehole",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Wrangler Configuration

```toml
# wrangler.toml
name = "my-app"
main = "dist/index.js"
compatibility_date = "2024-01-01"

[site]
bucket = "./public"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id"
```

### 6. Generate Routes

```bash
# Generate route definitions from your file structure
pnpm routes
```

This creates a `routes.ts` file that exports your routes array.

## Integration with fixi.js

[fixi.js](https://github.com/bigskysoftware/fixi) is a minimalist hypermedia library (~3.3KB) that adds AJAX behavior to your HTML. It's like a lightweight alternative to htmx. To use it with @mewhhaha/squarehole:

### 1. Include fixi.js in your HTML

For development, you can use the CDN:

```tsx
// app/_layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <script
          src="https://cdn.jsdelivr.net/gh/bigskysoftware/fixi@0.9.0/fixi.js"
          crossorigin="anonymous"
          integrity="sha256-0957yKwrGW4niRASx0/UxJxBY/xBhYK63vDCnTF7hH4="
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

For production, we recommend downloading and vendoring fixi.js:
1. Download `fixi.js` from the [fixi repository](https://github.com/bigskysoftware/fixi)
2. Place it in your `public/` directory
3. Reference it as `<script src="/fixi.js"></script>`

### 2. Use fixi attributes

fixi uses these main attributes:
- `fx-action`: URL for the request
- `fx-method`: HTTP method (default: GET)
- `fx-target`: CSS selector for response placement
- `fx-swap`: How to swap content (innerHTML, outerHTML, beforeend, etc.)
- `fx-trigger`: Event that triggers request (click, submit, change, etc.)

```tsx
// app/components/TodoList.tsx
export default function TodoList() {
  return (
    <div>
      <form fx-action="/api/todos" fx-method="post" fx-target="#todo-list" fx-swap="beforeend">
        <input type="text" name="task" required />
        <button type="submit">Add Todo</button>
      </form>

      <ul id="todo-list">
        <li>
          <span>Sample todo</span>
          <button fx-action="/api/todos/1" fx-method="delete" fx-target="closest li" fx-swap="outerHTML">
            Delete
          </button>
        </li>
      </ul>
    </div>
  );
}

// app/api/todos.tsx
export async function action({ request }) {
  const formData = await request.formData();
  const task = formData.get('task');
  const id = Date.now();

  // Return HTML fragment using JSX
  const html = await (
    <li>
      <span>{task}</span>
      <button
        fx-action={`/api/todos/${id}`}
        fx-method="delete"
        fx-target="closest li"
        fx-swap="outerHTML"
      >
        Delete
      </button>
    </li>
  ).toPromise();

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

## Route File Conventions

@mewhhaha/squarehole uses **flat file-based routing** where all routes are defined as files in the `app/routes` directory. Use dots (`.`) to create URL path segments:

- `_index.tsx` - Index routes (e.g., `routes/_index.tsx` → `/`)
- `about.tsx` - Static routes (e.g., `routes/about.tsx` → `/about`)
- `blog._index.tsx` - Nested index routes (e.g., → `/blog`)
- `blog.posts.tsx` - Nested routes (e.g., → `/blog/posts`)
- `blog.$slug.tsx` - Dynamic segments (e.g., → `/blog/:slug`)
- `users.$id.edit.tsx` - Multiple segments (e.g., → `/users/:id/edit`)
- `(auth).login.tsx` - Optional segments (e.g., → `/login` or `/auth/login`)
- `$.tsx` - Catch-all routes
- `.ts` files - API routes (no JSX)

**Important:** Unlike nested routing systems, all route files must be placed directly in the `routes` directory, not in subdirectories.

## Advanced Features

### Vite Plugin

@mewhhaha/squarehole provides a comprehensive Vite plugin that:

- **Auto-generates routes** from your file system during development
- **Fixes `import.meta.url`** references that can break in Workers environments
- **Watches for route changes** and regenerates automatically

```typescript
import { squarehole } from '@mewhhaha/squarehole/vite-plugin';

// Basic usage
squarehole()

// With options
squarehole({
  appFolder: './app',    // Routes directory (default: './app')
  fixImportMeta: true,   // Fix import.meta.url (default: true)
})
```

### Custom Error Pages

```tsx
// app/_error.tsx
export default function ErrorPage({ error }) {
  return (
    <div>
      <h1>Error {error.status || 500}</h1>
      <p>{error.message || 'Something went wrong'}</p>
    </div>
  );
}
```

### Middleware

```typescript
// src/middleware.ts
export function withAuth(handler) {
  return async (args) => {
    const token = args.request.headers.get('Authorization');
    if (!token) {
      throw new Response('Unauthorized', { status: 401 });
    }
    return handler(args);
  };
}

// app/admin/users.tsx
import { withAuth } from '@/middleware';

export const loader = withAuth(async ({ request }) => {
  return { users: await getUsers() };
});
```

## Performance Tips

1. **Use streaming** - Take advantage of @mewhhaha/squarehole's streaming HTML support
2. **Optimize loaders** - Run data fetching in parallel when possible
3. **Cache responses** - Use Cloudflare's cache API for static content
4. **Minimize JavaScript** - Server-render as much as possible
5. **Use fixi.js** - Add interactivity without heavy JavaScript frameworks

## Vite plugin Tips

A plugin for auto-generating routes on build and updates, and also fixing the import.meta.url references in the build output.

```tsx
import type { PluginOption } from "vite";
import { generate } from "@mewhhaha/squarehole/fs-routes";
import path from "node:path";

export interface SquareholePluginOptions {
  /**
   * The folder containing the route files (e.g., "./app")
   */
  appFolder?: string;
  /**
   * Whether to fix import.meta.url references in the build output
   * @default true
   */
  fixImportMeta?: boolean;
}

/**
 * Combined Vite plugin for @mewhhaha/squarehole that:
 * - Watches for route file changes and regenerates routes
 * - Fixes import.meta.url references in the build output
 */
export const squarehole = (
  options: SquareholePluginOptions = {},
): PluginOption => {
  const { appFolder = "./app", fixImportMeta = true } = options;

  return {
    name: "vite-plugin-squarehole",

    // Development: Watch for route changes
    configureServer(server) {
      // Generate routes on server start
      generate(appFolder);

      // Watch for file changes and regenerate routes
      server.watcher.on("all", (event, file) => {
        // Skip change events (only care about add/unlink)
        if (event === "change") return;

        // Check if the file is in the app folder
        const resolvedAppPath = path.resolve(appFolder);
        const resolvedFilePath = path.resolve(file);

        if (resolvedFilePath.startsWith(resolvedAppPath)) {
          generate(appFolder);
        }
      });
    },

    // Build: Fix import.meta.url references
    renderChunk(code) {
      if (!fixImportMeta) return code;

      // Replace import.meta.url with a static string
      // This prevents runtime errors when import.meta.url is undefined
      return code.replaceAll(/import\.meta\.url/g, '"file://"');
    },
  };
};
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT
