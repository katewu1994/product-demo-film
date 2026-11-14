console.error(
  JSON.stringify({
    status: "blocked",
    tasks: ["T03", "T05", "T13"],
    message:
      "真实验收入口尚未接通。需已接受预算、已验证的 Codex 图片与 Omni 配置、目标产品和原声场景。未发起请求。",
  }),
);
process.exitCode = 2;
