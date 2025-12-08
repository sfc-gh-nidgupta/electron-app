export async function chatWithOpenAI(messages, modelOverride) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = modelOverride || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Create a .env with OPENAI_API_KEY=...');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return { content, model };
}


