# 工程决定

- T00 采用 Node 24.22.1 原生 TypeScript 类型擦除与 `node:sqlite`，React 由 Vite 构建。CLI 和 GUI 版本随用户安装，doctor 记录实测值。npm 依赖由 pnpm 锁文件固定。
- Apple Silicon 默认使用锁定的 npm 平台二进制运行 FFmpeg 和 ffprobe，无需全局安装。用户可通过 `PRODUCTFILM_FFMPEG` 与 `PRODUCTFILM_FFPROBE` 选择本机可执行文件。媒体构建版本及其许可证见相应安装包。
- pnpm 11 内建 `doctor`。运行项目诊断时采用 `pnpm run doctor`。
- 首个工作台增量在开发启动时用 Vite 构建静态页面，由 Fastify 同源提供。这样开发和发布使用相同的本地会话及 Host / Origin 检查。
