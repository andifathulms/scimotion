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
        {/* The live region is rendered unconditionally and filled later. A
            region that appears at the same moment as its content is frequently
            missed: assistive tech has to be observing the node before it
            changes. */}
        <span role="status" className="ml-auto text-sm font-medium text-text-secondary">
          {submitted && (
            <>
              <span aria-hidden="true">{score} / {questions.length}</span>
              <span className="sr-only">
                Scored {score} out of {questions.length}. Explanations are now shown.
              </span>
            </>
          )}
        </span>
      </div>

      <div className="p-5 space-y-7">
        {questions.map((q, qi) => (
          // A question is a group of mutually exclusive choices, which is what
          // fieldset/legend and a radio group are for. These were buttons: no
          // grouping, no exposed selected state, and selection signalled only by
          // border and background colour.
          <fieldset key={qi}>
            <legend className="text-sm font-medium text-text-primary mb-3">
              {qi + 1}. {q.q}
            </legend>
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
                  <label key={oi} className={`block ${submitted ? 'cursor-default' : 'cursor-pointer'}`}>
                    {/* Visually hidden, not display:none — it stays focusable
                        and in the accessibility tree. The design has never shown
                        a radio dot; the lettered badge is the visual state, so
                        the control is hidden and the badge is driven from it. */}
                    <input
                      type="radio"
                      name={`quiz-q${qi}`}
                      value={oi}
                      checked={isSelected}
                      onChange={() => choose(qi, oi)}
                      disabled={submitted}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${cls}`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {submitted && isCorrect && <Check size={15} className="text-accent-teal" />}
                        {submitted && isSelected && !isCorrect && <X size={15} className="text-accent-pink" />}
                        {(!submitted || (!isCorrect && !isSelected)) && (
                          <span className="inline-block w-[15px] text-text-muted">{String.fromCharCode(65 + oi)}</span>
                        )}
                      </span>
                      <span>{opt}</span>
                      {/* The tick and cross are aria-hidden (lucide's default),
                          so without this the verdict is carried by colour alone. */}
                      {submitted && isCorrect && <span className="sr-only">Correct answer</span>}
                      {submitted && isSelected && !isCorrect && (
                        <span className="sr-only">Your answer, incorrect</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
            {submitted && (
              <p className="mt-2.5 text-xs text-text-secondary leading-relaxed border-l-2 border-border pl-3">
                {q.explanation}
              </p>
            )}
          </fieldset>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-border flex items-center gap-3">
        {!submitted ? (
          <>
            {/* aria-disabled rather than disabled: a disabled button leaves the
                tab order, so a keyboard user who had answered two of three
                reached the end of the quiz, found nothing, and got no reason
                why. This stays focusable and points at the counter that
                explains it. */}
            <button
              onClick={() => allAnswered && setSubmitted(true)}
              aria-disabled={!allAnswered}
              aria-describedby="quiz-progress"
              className="px-4 py-2 rounded-lg bg-accent-gold text-on-accent text-sm font-medium hover:bg-accent-gold/90 transition-colors aria-disabled:cursor-not-allowed aria-disabled:bg-bg-hover aria-disabled:text-text-muted aria-disabled:hover:bg-bg-hover"
            >
              Check answers
            </button>
            {/* The disabled look was opacity-40 over the gold fill, which put the
                label under 2:1. Muted-on-hover is a real token pair at 4.8:1. */}
            <span id="quiz-progress" className="text-xs text-text-muted">
              {answeredCount} / {questions.length} answered
            </span>
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
