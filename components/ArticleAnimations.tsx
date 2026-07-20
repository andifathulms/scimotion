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

export const BayesTheoremAnimation = dynamic(
  () => import('@/components/animations/BayesTheoremAnimation').then(m => ({ default: m.BayesTheoremAnimation })),
  { ssr: false }
)

export const BayesUpdateAnimation = dynamic(
  () => import('@/components/animations/BayesUpdateAnimation').then(m => ({ default: m.BayesUpdateAnimation })),
  { ssr: false }
)

export const DynamicProgrammingAnimation = dynamic(
  () => import('@/components/animations/DynamicProgrammingAnimation').then(m => ({ default: m.DynamicProgrammingAnimation })),
  { ssr: false }
)

export const MemoizationTreeAnimation = dynamic(
  () => import('@/components/animations/MemoizationTreeAnimation').then(m => ({ default: m.MemoizationTreeAnimation })),
  { ssr: false }
)

export const EntropyAnimation = dynamic(
  () => import('@/components/animations/EntropyAnimation').then(m => ({ default: m.EntropyAnimation })),
  { ssr: false }
)

export const MicrostatesAnimation = dynamic(
  () => import('@/components/animations/MicrostatesAnimation').then(m => ({ default: m.MicrostatesAnimation })),
  { ssr: false }
)

export const ImmuneResponseAnimation = dynamic(
  () => import('@/components/animations/ImmuneResponseAnimation').then(m => ({ default: m.ImmuneResponseAnimation })),
  { ssr: false }
)

export const ClonalSelectionAnimation = dynamic(
  () => import('@/components/animations/ClonalSelectionAnimation').then(m => ({ default: m.ClonalSelectionAnimation })),
  { ssr: false }
)

export const GradientDescentAnimation = dynamic(
  () => import('@/components/animations/GradientDescentAnimation').then(m => ({ default: m.GradientDescentAnimation })),
  { ssr: false }
)

export const LearningRateAnimation = dynamic(
  () => import('@/components/animations/LearningRateAnimation').then(m => ({ default: m.LearningRateAnimation })),
  { ssr: false }
)

export const KeplerOrbitAnimation = dynamic(
  () => import('@/components/animations/KeplerOrbitAnimation').then(m => ({ default: m.KeplerOrbitAnimation })),
  { ssr: false }
)

export const HarmonicLawAnimation = dynamic(
  () => import('@/components/animations/HarmonicLawAnimation').then(m => ({ default: m.HarmonicLawAnimation })),
  { ssr: false }
)

export const EigenvectorAnimation = dynamic(
  () => import('@/components/animations/EigenvectorAnimation').then(m => ({ default: m.EigenvectorAnimation })),
  { ssr: false }
)

export const PowerIterationAnimation = dynamic(
  () => import('@/components/animations/PowerIterationAnimation').then(m => ({ default: m.PowerIterationAnimation })),
  { ssr: false }
)

export const PharmacokineticsAnimation = dynamic(
  () => import('@/components/animations/PharmacokineticsAnimation').then(m => ({ default: m.PharmacokineticsAnimation })),
  { ssr: false }
)

export const HalfLifeAnimation = dynamic(
  () => import('@/components/animations/HalfLifeAnimation').then(m => ({ default: m.HalfLifeAnimation })),
  { ssr: false }
)

export const HashTableAnimation = dynamic(
  () => import('@/components/animations/HashTableAnimation').then(m => ({ default: m.HashTableAnimation })),
  { ssr: false }
)

export const LoadFactorAnimation = dynamic(
  () => import('@/components/animations/LoadFactorAnimation').then(m => ({ default: m.LoadFactorAnimation })),
  { ssr: false }
)

export const MarkovChainAnimation = dynamic(
  () => import('@/components/animations/MarkovChainAnimation').then(m => ({ default: m.MarkovChainAnimation })),
  { ssr: false }
)

export const StationaryDistributionAnimation = dynamic(
  () => import('@/components/animations/StationaryDistributionAnimation').then(m => ({ default: m.StationaryDistributionAnimation })),
  { ssr: false }
)

export const DopplerAnimation = dynamic(
  () => import('@/components/animations/DopplerAnimation').then(m => ({ default: m.DopplerAnimation })),
  { ssr: false }
)

export const RedshiftAnimation = dynamic(
  () => import('@/components/animations/RedshiftAnimation').then(m => ({ default: m.RedshiftAnimation })),
  { ssr: false }
)

export const DiffieHellmanAnimation = dynamic(
  () => import('@/components/animations/DiffieHellmanAnimation').then(m => ({ default: m.DiffieHellmanAnimation })),
  { ssr: false }
)

export const ModularExponentiationAnimation = dynamic(
  () => import('@/components/animations/ModularExponentiationAnimation').then(m => ({ default: m.ModularExponentiationAnimation })),
  { ssr: false }
)
