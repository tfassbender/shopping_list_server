import { getLanguage } from '../i18n/messages'

/** The parts of the (not yet standardized) Web Speech API that are used here. */
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type RecognitionConstructor = new () => SpeechRecognitionLike

function recognitionConstructor(): RecognitionConstructor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Voice input is offered only where the browser has free speech recognition built in (e.g. Chrome, Android). */
export function isVoiceInputSupported(): boolean {
  return typeof window !== 'undefined' && recognitionConstructor() !== undefined
}

/**
 * Listens once and reports the recognized text (in the UI language). Returns a function to cancel.
 * `onEnd` is always called at the end, also after errors or cancel.
 */
export function listenOnce(handlers: { onText: (text: string) => void; onError: () => void; onEnd: () => void }): () => void {
  const Recognition = recognitionConstructor()
  if (!Recognition) {
    handlers.onError()
    handlers.onEnd()
    return () => {}
  }
  const recognition = new Recognition()
  recognition.lang = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript?.trim()
    if (text) handlers.onText(text)
  }
  recognition.onerror = handlers.onError
  recognition.onend = handlers.onEnd
  recognition.start()
  return () => recognition.abort()
}
