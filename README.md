# wechat-oa

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

The local model gateway is expected at `http://127.0.0.1:3000`, so the app dev server intentionally runs on `3001`.

AI gateway settings are loaded from local environment variables such as `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_WIRE_API`. When these variables are present, the app does not read or write AI model settings through the SQL `settings` table.

## Docker Deployment

Build and run the app on port `3001`:

```bash
docker compose up --build
```

Then open [http://localhost:3001](http://localhost:3001).

The compose setup reads local secrets from `.env.local`, persists SQLite data and generated images in the `wechat_oa_data` Docker volume, and exposes the app as `3001:3001`.

When the model gateway runs on the host machine, the container uses the sub2api backend at `http://host.docker.internal:8080` for `OPENAI_BASE_URL` and `OPENAI_REVIEW_BASE_URL` by default. Override with:

```bash
OPENAI_BASE_URL_DOCKER=http://your-gateway:8080 docker compose up --build
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
