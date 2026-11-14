// Keep execution on this machine; source never goes through the collaboration server.
export const EXECUTION_URL = 'http://127.0.0.1:8090/execute'

const apiErrors = {
  busy: 'The execution service is busy (two jobs are already running). Try again shortly.',
  execution_unavailable: 'Execution is unavailable. Check that Docker is running and the Python/Node images are installed.',
  invalid_input: 'The execution service rejected the language or code. Use Python or JavaScript with at most 65,536 characters.',
  invalid_json: 'The execution service rejected the request JSON.',
  request_too_large: 'The encoded request exceeds the execution service’s 70,000-byte limit. Shorten the code.',
  origin_not_allowed: 'This frontend origin is not allowed by the execution service. Check EXECUTION_ORIGIN.',
}

export async function executeCode({ language, code, signal }) {
  const response = await fetch(EXECUTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code }),
    signal,
    credentials: 'omit',
    redirect: 'error',
  })
  let result
  try {
    result = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`Execution service returned invalid JSON (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    throw new Error(apiErrors[result?.error] || `Execution request failed (HTTP ${response.status}${typeof result?.error === 'string' ? `: ${result.error}` : ''}).`)
  }
  if (typeof result?.stdout !== 'string' || !Number.isInteger(result.exitCode) || typeof result.timedOut !== 'boolean') {
    throw new Error('Execution service returned an unexpected result. Expected stdout, exitCode and timedOut.')
  }
  return result
}
