# AI Tutor

AI Tutor is a calm, focused study workspace for turning difficult homework into clear explanations. It supports typed questions, homework photos, chat history, subject filters, and Groq-powered tutoring.

## InfinityFree upload

InfinityFree serves static HTML/CSS/JavaScript and PHP. Upload these files and folders to `public_html`:

- `index.html`, `chats.html`
- `main.js`, `chats.js`, `api.js`, `styles.css`
- `.htaccess`
- `api/*.php`

The browser frontend is plain HTML/CSS/JavaScript and does not require a build step or Node runtime. The PHP endpoints keep `GROQ_API_KEY` on the server and expose:

- `GET /api/health`
- `GET /api/models`
- `POST /api/tutor`
- `GET|POST|DELETE /api/chats`

Enable PHP in the InfinityFree control panel and configure `GROQ_API_KEY` using the host's PHP/environment configuration. Do not place the key in `main.js`, `chats.js`, `api.js`, HTML, or any public file. If InfinityFree does not provide environment variables for the account, use a server-side configuration method supported by the account and keep that file outside `public_html` when possible.

The `.htaccess` file maps extensionless `/api/*` URLs to the PHP endpoints. If Apache rewrite rules are disabled on the account, change the browser API client to use `/api/health.php`, `/api/models.php`, `/api/tutor.php`, and `/api/chats.php` directly.

## Source and local development

The root HTML, JavaScript, CSS, and `api/*.php` files are the complete InfinityFree upload. Do not upload `node_modules`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, or the Python files to `public_html`; they are local/reference sources only. The optional Node and TypeScript files are retained for development and type checking, but InfinityFree requires no npm install, build step, Node process, or Python process.

## Security

The tutor API sends the Groq request server-side. Uploaded images are passed through as data URLs and are not intentionally persisted. Chat history is stored in `api/data/chats.json`; ensure that directory is writable and not publicly browsable on the host.
