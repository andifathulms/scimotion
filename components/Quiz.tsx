'use client'
import { useState } from 'react'
import { Check, X, RotateCcw, GraduationCap } from 'lucide-react'
import type { QuizQuestion } from '@/lib/articles'

export function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [selected, setSelected] = useState<(number | null)[]>(() => questions.map(() => null))
  const [submitted, setSubmitted] = useState(false)

  if (!questions || questions.length === 0) return null

  const answeredCount = selected.filter(s => s !== null).length
  const allAnswered = answeredCount === questions.length
  const score = questions.reduce((acc, q, i) => acc + (selected[i] === q.answer ? 1 : 0), 0)

  const choose = (qi: number, oi: number) => {
    if (submitted) return
    setSelected(prev => prev.map((v, i) => (i === qi ? oi : v)))
  }

  const reset = () => {
    setSelected(questions.map(() => null))
    setSubmitted(false)
  }

  return (
    <div className="my-10 rounded-card border border-border bg-bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <GraduationCap size={16} className="text-accent-gold" />
        <span className="text-sm font-semibold text-text-primary">Check your understanding</span>
        {submitted && (
          <span className="ml-auto text-sm font-medium text-text-secondary">
            {score} / {questions.length}
          </span>
        )}
      </div>

      <div className="p-5 space-y-7">
        {questions.map((q, qi) => (
          <div key={qi}>
            <p className="text-sm font-medium text-text-primary mb-3">
              {qi + 1}. {q.q}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const isSelected = selected[qi] === oi
                const isCorrect = oi === q.answer
                let cls = 'border-border text-text-secondary hover:border-border-hover'
                if (submitted) {
                  if (isCorrect) cls = 'border-accent-teal/50 bg-accent-teal/10 text-text-primary'
                  else if (isSelected) cls = 'border-accent-pink/50 bg-accent-pink/10 text-text-primary'
                  else cls = 'border-border text-text-muted'
                } else if (isSelected) {
                  cls = 'border-accent-gold bg-accent-gold/10 text-text-primary'
                }
                return (
                  <button
                    key={oi}
                    onClick={() => choose(qi, oi)}
                    disabled={submitted}
                    className={`w-full text-left text-sm rounded-lg border px-3.5 py-2.5 transition-colors flex items-start gap-2.5 ${cls} ${submitted ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {submitted && isCorrect && <Check size={15} className="text-accent-teal" />}
                      {submitted && isSelected && !isCorrect && <X size={15} className="text-accent-pink" />}
                      {(!submitted || (!isCorrect && !isSelected)) && (
                        <span className="inline-block w-[15px] text-text-muted">{String.fromCharCode(65 + oi)}</span>
                      )}
                    </span>
                    <span>{opt}</span>
                  </button>
                )
              })}
            </div>
            {submitted && (
              <p className="mt-2.5 text-xs text-text-secondary leading-relaxed border-l-2 border-border pl-3">
                {q.explanation}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-border flex items-center gap-3">
        {!submitted ? (
          <>
            <button
              onClick={() => setSubmitted(true)}
              disabled={!allAnswered}
              className="px-4 py-2 rounded-lg bg-accent-gold text-on-accent text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-gold/90 transition-colors"
            >
              Check answers
            </button>
            <span className="text-xs text-text-muted">{answeredCount} / {questions.length} answered</span>
          </>
        ) : (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:border-border-hover text-sm text-text-secondary transition-colors"
          >
            <RotateCcw size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  )
}
