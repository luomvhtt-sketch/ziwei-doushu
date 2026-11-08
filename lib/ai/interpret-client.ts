/**
 * 浏览器与服务端都能用的解读契约。
 * 这里没有密钥、没有上游地址，客户端组件只应引用本文件。
 */

export const INTERPRET_DISCLAIMER =
  '命盘与提问会发送到你在服务端配置的模型。此为传统文化娱乐参考，不保证预测准确，也不构成确定性的医疗或投资建议。';

export const INTERPRET_API_MISSING_MESSAGE =
  '开源版不含 AI 解读接口（/api/interpret），需要你自己实现后才能用，详见 README「快速开始」。排盘本身不需要任何 API Key。';

export function interpretFailureText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'api-missing') return INTERPRET_API_MISSING_MESSAGE;
  if (
    error instanceof Error &&
    error.message &&
    error.message !== '请求失败' &&
    error.message !== '无响应流'
  ) {
    return error.message;
  }
  return fallback;
}

/** 非 2xx 时读出服务端中文说明；404 保持原来的「接口缺失」标记。 */
export async function openInterpretStream(res: Response): Promise<ReadableStream<Uint8Array>> {
  if (res.status === 404) throw new Error('api-missing');
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json() as { message?: unknown };
      if (typeof data?.message === 'string') detail = data.message.trim();
    } catch {
      /* 非 JSON 错误沿用面板里的简短失败文案 */
    }
    throw new Error(detail || '请求失败');
  }
  if (!res.body) throw new Error('无响应流');
  return res.body;
}

/**
 * 读取页面约定的 SSE：`data: {"delta":{"text":"..."}}`，以 `data: [DONE]` 结束。
 * 不完整的一行会留到下一块再解析，避免一个汉字被拆成两次 read 时丢掉。
 */
export async function readInterpretSse(
  body: ReadableStream<Uint8Array>,
  onText: (fullText: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let full = '';

  const consumeLine = (rawLine: string): boolean => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith('data:')) return false;
    let data = line.slice(5);
    if (data.startsWith(' ')) data = data.slice(1);
    if (data === '[DONE]') return true;
    try {
      const text = (JSON.parse(data) as { delta?: { text?: unknown } }).delta?.text;
      if (typeof text === 'string' && text.length > 0) {
        full += text;
        onText(full);
      }
    } catch {
      /* 跳过半行以外的坏帧；半行不会进到这里 */
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (consumeLine(line)) return full;
      }
    }
    pending += decoder.decode();
    if (pending) consumeLine(pending);
    return full;
  } finally {
    reader.releaseLock();
  }
}
