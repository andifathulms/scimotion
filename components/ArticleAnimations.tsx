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

export const LogisticMapAnimation = dynamic(
  () => import('@/components/animations/LogisticMapAnimation').then(m => ({ default: m.LogisticMapAnimation })),
  { ssr: false }
)

export const ButterflyEffectAnimation = dynamic(
  () => import('@/components/animations/ButterflyEffectAnimation').then(m => ({ default: m.ButterflyEffectAnimation })),
  { ssr: false }
)

export const ShannonEntropyAnimation = dynamic(
  () => import('@/components/animations/ShannonEntropyAnimation').then(m => ({ default: m.ShannonEntropyAnimation })),
  { ssr: false }
)

export const HuffmanCodingAnimation = dynamic(
  () => import('@/components/animations/HuffmanCodingAnimation').then(m => ({ default: m.HuffmanCodingAnimation })),
  { ssr: false }
)

export const GlucoseInsulinAnimation = dynamic(
  () => import('@/components/animations/GlucoseInsulinAnimation').then(m => ({ default: m.GlucoseInsulinAnimation })),
  { ssr: false }
)

export const FeedbackLoopAnimation = dynamic(
  () => import('@/components/animations/FeedbackLoopAnimation').then(m => ({ default: m.FeedbackLoopAnimation })),
  { ssr: false }
)

export const SuperconductivityAnimation = dynamic(
  () => import('@/components/animations/SuperconductivityAnimation').then(m => ({ default: m.SuperconductivityAnimation })),
  { ssr: false }
)

export const MeissnerEffectAnimation = dynamic(
  () => import('@/components/animations/MeissnerEffectAnimation').then(m => ({ default: m.MeissnerEffectAnimation })),
  { ssr: false }
)

export const NeuralNetworkAnimation = dynamic(
  () => import('@/components/animations/NeuralNetworkAnimation').then(m => ({ default: m.NeuralNetworkAnimation })),
  { ssr: false }
)

export const BackpropagationAnimation = dynamic(
  () => import('@/components/animations/BackpropagationAnimation').then(m => ({ default: m.BackpropagationAnimation })),
  { ssr: false }
)

export const DNAReplicationAnimation = dynamic(
  () => import('@/components/animations/DNAReplicationAnimation').then(m => ({ default: m.DNAReplicationAnimation })),
  { ssr: false }
)

export const ProofreadingAnimation = dynamic(
  () => import('@/components/animations/ProofreadingAnimation').then(m => ({ default: m.ProofreadingAnimation })),
  { ssr: false }
)

export const ComplexityGrowthAnimation = dynamic(
  () => import('@/components/animations/ComplexityGrowthAnimation').then(m => ({ default: m.ComplexityGrowthAnimation })),
  { ssr: false }
)

export const SATReductionAnimation = dynamic(
  () => import('@/components/animations/SATReductionAnimation').then(m => ({ default: m.SATReductionAnimation })),
  { ssr: false }
)

export const NashEquilibriumAnimation = dynamic(
  () => import('@/components/animations/NashEquilibriumAnimation').then(m => ({ default: m.NashEquilibriumAnimation })),
  { ssr: false }
)

export const EvolutionaryGameAnimation = dynamic(
  () => import('@/components/animations/EvolutionaryGameAnimation').then(m => ({ default: m.EvolutionaryGameAnimation })),
  { ssr: false }
)

export const DerivativeAnimation = dynamic(
  () => import('@/components/animations/DerivativeAnimation').then(m => ({ default: m.DerivativeAnimation })),
  { ssr: false }
)

export const DerivativeFunctionAnimation = dynamic(
  () => import('@/components/animations/DerivativeFunctionAnimation').then(m => ({ default: m.DerivativeFunctionAnimation })),
  { ssr: false }
)

export const HaltingProblemAnimation = dynamic(
  () => import('@/components/animations/HaltingProblemAnimation').then(m => ({ default: m.HaltingProblemAnimation })),
  { ssr: false }
)

export const TerminationAnimation = dynamic(
  () => import('@/components/animations/TerminationAnimation').then(m => ({ default: m.TerminationAnimation })),
  { ssr: false }
)

export const SIRModelAnimation = dynamic(
  () => import('@/components/animations/SIRModelAnimation').then(m => ({ default: m.SIRModelAnimation })),
  { ssr: false }
)

export const HerdImmunityAnimation = dynamic(
  () => import('@/components/animations/HerdImmunityAnimation').then(m => ({ default: m.HerdImmunityAnimation })),
  { ssr: false }
)

export const ResonanceAnimation = dynamic(
  () => import('@/components/animations/ResonanceAnimation').then(m => ({ default: m.ResonanceAnimation })),
  { ssr: false }
)

export const StandingWaveAnimation = dynamic(
  () => import('@/components/animations/StandingWaveAnimation').then(m => ({ default: m.StandingWaveAnimation })),
  { ssr: false }
)

export const ElectromagneticWaveAnimation = dynamic(
  () => import('@/components/animations/ElectromagneticWaveAnimation').then(m => ({ default: m.ElectromagneticWaveAnimation })),
  { ssr: false }
)

export const SpectrumAnimation = dynamic(
  () => import('@/components/animations/SpectrumAnimation').then(m => ({ default: m.SpectrumAnimation })),
  { ssr: false }
)

export const EquilibriumAnimation = dynamic(
  () => import('@/components/animations/EquilibriumAnimation').then(m => ({ default: m.EquilibriumAnimation })),
  { ssr: false }
)

export const LeChatelierAnimation = dynamic(
  () => import('@/components/animations/LeChatelierAnimation').then(m => ({ default: m.LeChatelierAnimation })),
  { ssr: false }
)

export const ChemicalBondAnimation = dynamic(
  () => import('@/components/animations/ChemicalBondAnimation').then(m => ({ default: m.ChemicalBondAnimation })),
  { ssr: false }
)

export const ElectronegativityAnimation = dynamic(
  () => import('@/components/animations/ElectronegativityAnimation').then(m => ({ default: m.ElectronegativityAnimation })),
  { ssr: false }
)

export const PHScaleAnimation = dynamic(
  () => import('@/components/animations/PHScaleAnimation').then(m => ({ default: m.PHScaleAnimation })),
  { ssr: false }
)

export const TitrationAnimation = dynamic(
  () => import('@/components/animations/TitrationAnimation').then(m => ({ default: m.TitrationAnimation })),
  { ssr: false }
)

export const GalvanicCellAnimation = dynamic(
  () => import('@/components/animations/GalvanicCellAnimation').then(m => ({ default: m.GalvanicCellAnimation })),
  { ssr: false }
)

export const CellPotentialAnimation = dynamic(
  () => import('@/components/animations/CellPotentialAnimation').then(m => ({ default: m.CellPotentialAnimation })),
  { ssr: false }
)

export const ReactionRateAnimation = dynamic(
  () => import('@/components/animations/ReactionRateAnimation').then(m => ({ default: m.ReactionRateAnimation })),
  { ssr: false }
)

export const CatalysisAnimation = dynamic(
  () => import('@/components/animations/CatalysisAnimation').then(m => ({ default: m.CatalysisAnimation })),
  { ssr: false }
)

export const AtomicOrbitalAnimation = dynamic(
  () => import('@/components/animations/AtomicOrbitalAnimation').then(m => ({ default: m.AtomicOrbitalAnimation })),
  { ssr: false }
)

export const PeriodicTrendsAnimation = dynamic(
  () => import('@/components/animations/PeriodicTrendsAnimation').then(m => ({ default: m.PeriodicTrendsAnimation })),
  { ssr: false }
)

export const ReynoldsAnimation = dynamic(
  () => import('@/components/animations/ReynoldsAnimation').then(m => ({ default: m.ReynoldsAnimation })),
  { ssr: false }
)

export const LaminarTurbulentAnimation = dynamic(
  () => import('@/components/animations/LaminarTurbulentAnimation').then(m => ({ default: m.LaminarTurbulentAnimation })),
  { ssr: false }
)

export const PhaseTransitionAnimation = dynamic(
  () => import('@/components/animations/PhaseTransitionAnimation').then(m => ({ default: m.PhaseTransitionAnimation })),
  { ssr: false }
)

export const PhaseDiagramAnimation = dynamic(
  () => import('@/components/animations/PhaseDiagramAnimation').then(m => ({ default: m.PhaseDiagramAnimation })),
  { ssr: false }
)

export const ProteinFoldingAnimation = dynamic(
  () => import('@/components/animations/ProteinFoldingAnimation').then(m => ({ default: m.ProteinFoldingAnimation })),
  { ssr: false }
)

export const EnergyLandscapeAnimation = dynamic(
  () => import('@/components/animations/EnergyLandscapeAnimation').then(m => ({ default: m.EnergyLandscapeAnimation })),
  { ssr: false }
)

export const ConsensusAnimation = dynamic(
  () => import('@/components/animations/ConsensusAnimation').then(m => ({ default: m.ConsensusAnimation })),
  { ssr: false }
)

export const QuorumAnimation = dynamic(
  () => import('@/components/animations/QuorumAnimation').then(m => ({ default: m.QuorumAnimation })),
  { ssr: false }
)

export const CarbonCycleAnimation = dynamic(
  () => import('@/components/animations/CarbonCycleAnimation').then(m => ({ default: m.CarbonCycleAnimation })),
  { ssr: false }
)

export const KeelingCurveAnimation = dynamic(
  () => import('@/components/animations/KeelingCurveAnimation').then(m => ({ default: m.KeelingCurveAnimation })),
  { ssr: false }
)

export const GreenhouseEffectAnimation = dynamic(
  () => import('@/components/animations/GreenhouseEffectAnimation').then(m => ({ default: m.GreenhouseEffectAnimation })),
  { ssr: false }
)

export const RadiationSpectrumAnimation = dynamic(
  () => import('@/components/animations/RadiationSpectrumAnimation').then(m => ({ default: m.RadiationSpectrumAnimation })),
  { ssr: false }
)

export const OceanCirculationAnimation = dynamic(
  () => import('@/components/animations/OceanCirculationAnimation').then(m => ({ default: m.OceanCirculationAnimation })),
  { ssr: false }
)

export const ThermohalineAnimation = dynamic(
  () => import('@/components/animations/ThermohalineAnimation').then(m => ({ default: m.ThermohalineAnimation })),
  { ssr: false }
)

export const ConvectionAnimation = dynamic(
  () => import('@/components/animations/ConvectionAnimation').then(m => ({ default: m.ConvectionAnimation })),
  { ssr: false }
)

export const CirculationCellsAnimation = dynamic(
  () => import('@/components/animations/CirculationCellsAnimation').then(m => ({ default: m.CirculationCellsAnimation })),
  { ssr: false }
)

export const PlateTectonicsAnimation = dynamic(
  () => import('@/components/animations/PlateTectonicsAnimation').then(m => ({ default: m.PlateTectonicsAnimation })),
  { ssr: false }
)

export const SeafloorSpreadingAnimation = dynamic(
  () => import('@/components/animations/SeafloorSpreadingAnimation').then(m => ({ default: m.SeafloorSpreadingAnimation })),
  { ssr: false }
)

export const NaturalSelectionAnimation = dynamic(
  () => import('@/components/animations/NaturalSelectionAnimation').then(m => ({ default: m.NaturalSelectionAnimation })),
  { ssr: false }
)

export const GeneticDriftAnimation = dynamic(
  () => import('@/components/animations/GeneticDriftAnimation').then(m => ({ default: m.GeneticDriftAnimation })),
  { ssr: false }
)
