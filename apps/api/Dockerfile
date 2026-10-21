# Build from the repository root:  docker build -f apps/api/Dockerfile -t cityroyalty-api .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @cityroyalty/api --workspace @cityroyalty/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @cityroyalty/api

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @cityroyalty/api --workspace @cityroyalty/shared --include-workspace-root && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/data apps/api/data
USER node
EXPOSE 4000
WORKDIR /app/apps/api
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
