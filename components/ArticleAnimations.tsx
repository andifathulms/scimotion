'use client'
import dynamic from 'next/dynamic'

export const SieveAnimation = dynamic(
  () => import('@/components/animations/SieveAnimation').then(m => ({ default: m.SieveAnimation })),
  { ssr: false }
)

export const FourierAnimation = dynamic(
  () => import('@/components/animations/FourierAnimation').then(m => ({ default: m.FourierAnimation })),
  { ssr: false }
)

export const SortingAnimation = dynamic(
  () => import('@/components/animations/SortingAnimation').then(m => ({ default: m.SortingAnimation })),
  { ssr: false }
)

export const DoubleSlitAnimation = dynamic(
  () => import('@/components/animations/DoubleSlitAnimation').then(m => ({ default: m.DoubleSlitAnimation })),
  { ssr: false }
)

export const CardiacAnimation = dynamic(
  () => import('@/components/animations/CardiacAnimation').then(m => ({ default: m.CardiacAnimation })),
  { ssr: false }
)

export const FourierPhasesAnimation = dynamic(
  () => import('@/components/animations/FourierPhasesAnimation').then(m => ({ default: m.FourierPhasesAnimation })),
  { ssr: false }
)

export const SievePrimeGapAnimation = dynamic(
  () => import('@/components/animations/SievePrimeGapAnimation').then(m => ({ default: m.SievePrimeGapAnimation })),
  { ssr: false }
)

export const SortingComplexityAnimation = dynamic(
  () => import('@/components/animations/SortingComplexityAnimation').then(m => ({ default: m.SortingComplexityAnimation })),
  { ssr: false }
)

export const TaylorAnimation = dynamic(
  () => import('@/components/animations/TaylorAnimation').then(m => ({ default: m.TaylorAnimation })),
  { ssr: false }
)

export const PendulumAnimation = dynamic(
  () => import('@/components/animations/PendulumAnimation').then(m => ({ default: m.PendulumAnimation })),
  { ssr: false }
)

export const BinarySearchAnimation = dynamic(
  () => import('@/components/animations/BinarySearchAnimation').then(m => ({ default: m.BinarySearchAnimation })),
  { ssr: false }
)

export const ActionPotentialAnimation = dynamic(
  () => import('@/components/animations/ActionPotentialAnimation').then(m => ({ default: m.ActionPotentialAnimation })),
  { ssr: false }
)

export const NewtonMethodAnimation = dynamic(
  () => import('@/components/animations/NewtonMethodAnimation').then(m => ({ default: m.NewtonMethodAnimation })),
  { ssr: false }
)

export const EulersFormulaAnimation = dynamic(
  () => import('@/components/animations/EulersFormulaAnimation').then(m => ({ default: m.EulersFormulaAnimation })),
  { ssr: false }
)

export const TimeDilationAnimation = dynamic(
  () => import('@/components/animations/TimeDilationAnimation').then(m => ({ default: m.TimeDilationAnimation })),
  { ssr: false }
)

export const GraphTraversalAnimation = dynamic(
  () => import('@/components/animations/GraphTraversalAnimation').then(m => ({ default: m.GraphTraversalAnimation })),
  { ssr: false }
)

export const BrownianMotionAnimation = dynamic(
  () => import('@/components/animations/BrownianMotionAnimation').then(m => ({ default: m.BrownianMotionAnimation })),
  { ssr: false }
)

export const CLTAnimation = dynamic(
  () => import('@/components/animations/CLTAnimation').then(m => ({ default: m.CLTAnimation })),
  { ssr: false }
)

export const BinarySearchGrowthAnimation = dynamic(
  () => import('@/components/animations/BinarySearchGrowthAnimation').then(m => ({ default: m.BinarySearchGrowthAnimation })),
  { ssr: false }
)

export const PendulumPeriodAnimation = dynamic(
  () => import('@/components/animations/PendulumPeriodAnimation').then(m => ({ default: m.PendulumPeriodAnimation })),
  { ssr: false }
)

export const NeuronThresholdAnimation = dynamic(
  () => import('@/components/animations/NeuronThresholdAnimation').then(m => ({ default: m.NeuronThresholdAnimation })),
  { ssr: false }
)

export const DiffusionScalingAnimation = dynamic(
  () => import('@/components/animations/DiffusionScalingAnimation').then(m => ({ default: m.DiffusionScalingAnimation })),
  { ssr: false }
)

export const ECGTraceAnimation = dynamic(
  () => import('@/components/animations/ECGTraceAnimation').then(m => ({ default: m.ECGTraceAnimation })),
  { ssr: false }
)

export const StandardErrorAnimation = dynamic(
  () => import('@/components/animations/StandardErrorAnimation').then(m => ({ default: m.StandardErrorAnimation })),
  { ssr: false }
)

export const PhasorWaveAnimation = dynamic(
  () => import('@/components/animations/PhasorWaveAnimation').then(m => ({ default: m.PhasorWaveAnimation })),
  { ssr: false }
)

export const ShortestPathGridAnimation = dynamic(
  () => import('@/components/animations/ShortestPathGridAnimation').then(m => ({ default: m.ShortestPathGridAnimation })),
  { ssr: false }
)

export const NewtonConvergenceAnimation = dynamic(
  () => import('@/components/animations/NewtonConvergenceAnimation').then(m => ({ default: m.NewtonConvergenceAnimation })),
  { ssr: false }
)

export const LorentzFactorAnimation = dynamic(
  () => import('@/components/animations/LorentzFactorAnimation').then(m => ({ default: m.LorentzFactorAnimation })),
  { ssr: false }
)

export const SingleParticleBuildupAnimation = dynamic(
  () => import('@/components/animations/SingleParticleBuildupAnimation').then(m => ({ default: m.SingleParticleBuildupAnimation })),
  { ssr: false }
)

export const TaylorRadiusAnimation = dynamic(
  () => import('@/components/animations/TaylorRadiusAnimation').then(m => ({ default: m.TaylorRadiusAnimation })),
  { ssr: false }
)
