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

export const MilankovitchAnimation = dynamic(
  () => import('@/components/animations/MilankovitchAnimation').then(m => ({ default: m.MilankovitchAnimation })),
  { ssr: false }
)

export const IceCoreAnimation = dynamic(
  () => import('@/components/animations/IceCoreAnimation').then(m => ({ default: m.IceCoreAnimation })),
  { ssr: false }
)

export const PhotosynthesisAnimation = dynamic(
  () => import('@/components/animations/PhotosynthesisAnimation').then(m => ({ default: m.PhotosynthesisAnimation })),
  { ssr: false }
)

export const CalvinCycleAnimation = dynamic(
  () => import('@/components/animations/CalvinCycleAnimation').then(m => ({ default: m.CalvinCycleAnimation })),
  { ssr: false }
)

export const SeismicWaveAnimation = dynamic(
  () => import('@/components/animations/SeismicWaveAnimation').then(m => ({ default: m.SeismicWaveAnimation })),
  { ssr: false }
)

export const EarthInteriorAnimation = dynamic(
  () => import('@/components/animations/EarthInteriorAnimation').then(m => ({ default: m.EarthInteriorAnimation })),
  { ssr: false }
)

export const AntibioticResistanceAnimation = dynamic(
  () => import('@/components/animations/AntibioticResistanceAnimation').then(m => ({ default: m.AntibioticResistanceAnimation })),
  { ssr: false }
)

export const HorizontalTransferAnimation = dynamic(
  () => import('@/components/animations/HorizontalTransferAnimation').then(m => ({ default: m.HorizontalTransferAnimation })),
  { ssr: false }
)

export const MRIAnimation = dynamic(
  () => import('@/components/animations/MRIAnimation').then(m => ({ default: m.MRIAnimation })),
  { ssr: false }
)

export const KSpaceAnimation = dynamic(
  () => import('@/components/animations/KSpaceAnimation').then(m => ({ default: m.KSpaceAnimation })),
  { ssr: false }
)

export const ComplexPlaneAnimation = dynamic(
  () => import('@/components/animations/ComplexPlaneAnimation').then(m => ({ default: m.ComplexPlaneAnimation })),
  { ssr: false }
)

export const RootsOfUnityAnimation = dynamic(
  () => import('@/components/animations/RootsOfUnityAnimation').then(m => ({ default: m.RootsOfUnityAnimation })),
  { ssr: false }
)

export const FiniteAutomatonAnimation = dynamic(
  () => import('@/components/animations/FiniteAutomatonAnimation').then(m => ({ default: m.FiniteAutomatonAnimation })),
  { ssr: false }
)

export const PumpingLemmaAnimation = dynamic(
  () => import('@/components/animations/PumpingLemmaAnimation').then(m => ({ default: m.PumpingLemmaAnimation })),
  { ssr: false }
)

export const BindingEnergyAnimation = dynamic(
  () => import('@/components/animations/BindingEnergyAnimation').then(m => ({ default: m.BindingEnergyAnimation })),
  { ssr: false }
)

export const ChainReactionAnimation = dynamic(
  () => import('@/components/animations/ChainReactionAnimation').then(m => ({ default: m.ChainReactionAnimation })),
  { ssr: false }
)

export const RespirationAnimation = dynamic(
  () => import('@/components/animations/RespirationAnimation').then(m => ({ default: m.RespirationAnimation })),
  { ssr: false }
)

export const ETCAnimation = dynamic(
  () => import('@/components/animations/ETCAnimation').then(m => ({ default: m.ETCAnimation })),
  { ssr: false }
)

export const KineticTheoryAnimation = dynamic(
  () => import('@/components/animations/KineticTheoryAnimation').then(m => ({ default: m.KineticTheoryAnimation })),
  { ssr: false }
)

export const MaxwellBoltzmannAnimation = dynamic(
  () => import('@/components/animations/MaxwellBoltzmannAnimation').then(m => ({ default: m.MaxwellBoltzmannAnimation })),
  { ssr: false }
)

export const BlackHoleAnimation = dynamic(
  () => import('@/components/animations/BlackHoleAnimation').then(m => ({ default: m.BlackHoleAnimation })),
  { ssr: false }
)

export const GravitationalTimeDilationAnimation = dynamic(
  () => import('@/components/animations/GravitationalTimeDilationAnimation').then(m => ({ default: m.GravitationalTimeDilationAnimation })),
  { ssr: false }
)

export const TransitMethodAnimation = dynamic(
  () => import('@/components/animations/TransitMethodAnimation').then(m => ({ default: m.TransitMethodAnimation })),
  { ssr: false }
)

export const RadialVelocityAnimation = dynamic(
  () => import('@/components/animations/RadialVelocityAnimation').then(m => ({ default: m.RadialVelocityAnimation })),
  { ssr: false }
)

export const ExpandingUniverseAnimation = dynamic(
  () => import('@/components/animations/ExpandingUniverseAnimation').then(m => ({ default: m.ExpandingUniverseAnimation })),
  { ssr: false }
)

export const HubbleDiagramAnimation = dynamic(
  () => import('@/components/animations/HubbleDiagramAnimation').then(m => ({ default: m.HubbleDiagramAnimation })),
  { ssr: false }
)

export const StellarLifecycleAnimation = dynamic(
  () => import('@/components/animations/StellarLifecycleAnimation').then(m => ({ default: m.StellarLifecycleAnimation })),
  { ssr: false }
)

export const HydrostaticBalanceAnimation = dynamic(
  () => import('@/components/animations/HydrostaticBalanceAnimation').then(m => ({ default: m.HydrostaticBalanceAnimation })),
  { ssr: false }
)

export const NucleosynthesisAnimation = dynamic(
  () => import('@/components/animations/NucleosynthesisAnimation').then(m => ({ default: m.NucleosynthesisAnimation })),
  { ssr: false }
)

export const ElementOriginAnimation = dynamic(
  () => import('@/components/animations/ElementOriginAnimation').then(m => ({ default: m.ElementOriginAnimation })),
  { ssr: false }
)

export const BloodPressureAnimation = dynamic(
  () => import('@/components/animations/BloodPressureAnimation').then(m => ({ default: m.BloodPressureAnimation })),
  { ssr: false }
)

export const VascularResistanceAnimation = dynamic(
  () => import('@/components/animations/VascularResistanceAnimation').then(m => ({ default: m.VascularResistanceAnimation })),
  { ssr: false }
)

export const RotationCurveAnimation = dynamic(
  () => import('@/components/animations/RotationCurveAnimation').then(m => ({ default: m.RotationCurveAnimation })),
  { ssr: false }
)

export const GravitationalLensingAnimation = dynamic(
  () => import('@/components/animations/GravitationalLensingAnimation').then(m => ({ default: m.GravitationalLensingAnimation })),
  { ssr: false }
)

export const FreeEnergyAnimation = dynamic(
  () => import('@/components/animations/FreeEnergyAnimation').then(m => ({ default: m.FreeEnergyAnimation })),
  { ssr: false }
)

export const ReactionExtentAnimation = dynamic(
  () => import('@/components/animations/ReactionExtentAnimation').then(m => ({ default: m.ReactionExtentAnimation })),
  { ssr: false }
)

export const GeodynamoAnimation = dynamic(
  () => import('@/components/animations/GeodynamoAnimation').then(m => ({ default: m.GeodynamoAnimation })),
  { ssr: false }
)

export const MagnetosphereAnimation = dynamic(
  () => import('@/components/animations/MagnetosphereAnimation').then(m => ({ default: m.MagnetosphereAnimation })),
  { ssr: false }
)

export const GeneExpressionAnimation = dynamic(
  () => import('@/components/animations/GeneExpressionAnimation').then(m => ({ default: m.GeneExpressionAnimation })),
  { ssr: false }
)

export const GeneticCodeAnimation = dynamic(
  () => import('@/components/animations/GeneticCodeAnimation').then(m => ({ default: m.GeneticCodeAnimation })),
  { ssr: false }
)

export const ParallaxAnimation = dynamic(
  () => import('@/components/animations/ParallaxAnimation').then(m => ({ default: m.ParallaxAnimation })),
  { ssr: false }
)

export const DistanceLadderAnimation = dynamic(
  () => import('@/components/animations/DistanceLadderAnimation').then(m => ({ default: m.DistanceLadderAnimation })),
  { ssr: false }
)

export const FunctionalGroupAnimation = dynamic(
  () => import('@/components/animations/FunctionalGroupAnimation').then(m => ({ default: m.FunctionalGroupAnimation })),
  { ssr: false }
)

export const IsomerAnimation = dynamic(
  () => import('@/components/animations/IsomerAnimation').then(m => ({ default: m.IsomerAnimation })),
  { ssr: false }
)

export const NephronAnimation = dynamic(
  () => import('@/components/animations/NephronAnimation').then(m => ({ default: m.NephronAnimation })),
  { ssr: false }
)

export const ClearanceAnimation = dynamic(
  () => import('@/components/animations/ClearanceAnimation').then(m => ({ default: m.ClearanceAnimation })),
  { ssr: false }
)

export const OzoneCycleAnimation = dynamic(
  () => import('@/components/animations/OzoneCycleAnimation').then(m => ({ default: m.OzoneCycleAnimation })),
  { ssr: false }
)

export const OzoneVsClimateAnimation = dynamic(
  () => import('@/components/animations/OzoneVsClimateAnimation').then(m => ({ default: m.OzoneVsClimateAnimation })),
  { ssr: false }
)

export const PunnettSquareAnimation = dynamic(
  () => import('@/components/animations/PunnettSquareAnimation').then(m => ({ default: m.PunnettSquareAnimation })),
  { ssr: false }
)

export const InheritanceAnimation = dynamic(
  () => import('@/components/animations/InheritanceAnimation').then(m => ({ default: m.InheritanceAnimation })),
  { ssr: false }
)

export const GasExchangeAnimation = dynamic(
  () => import('@/components/animations/GasExchangeAnimation').then(m => ({ default: m.GasExchangeAnimation })),
  { ssr: false }
)

export const HemoglobinAnimation = dynamic(
  () => import('@/components/animations/HemoglobinAnimation').then(m => ({ default: m.HemoglobinAnimation })),
  { ssr: false }
)

export const GravitationalWaveAnimation = dynamic(
  () => import('@/components/animations/GravitationalWaveAnimation').then(m => ({ default: m.GravitationalWaveAnimation })),
  { ssr: false }
)

export const InterferometerAnimation = dynamic(
  () => import('@/components/animations/InterferometerAnimation').then(m => ({ default: m.InterferometerAnimation })),
  { ssr: false }
)

export const MembraneTransportAnimation = dynamic(
  () => import('@/components/animations/MembraneTransportAnimation').then(m => ({ default: m.MembraneTransportAnimation })),
  { ssr: false }
)

export const OsmosisAnimation = dynamic(
  () => import('@/components/animations/OsmosisAnimation').then(m => ({ default: m.OsmosisAnimation })),
  { ssr: false }
)

export const WaterCycleAnimation = dynamic(
  () => import('@/components/animations/WaterCycleAnimation').then(m => ({ default: m.WaterCycleAnimation })),
  { ssr: false }
)

export const WaterReservoirAnimation = dynamic(
  () => import('@/components/animations/WaterReservoirAnimation').then(m => ({ default: m.WaterReservoirAnimation })),
  { ssr: false }
)

export const IntermolecularForceAnimation = dynamic(
  () => import('@/components/animations/IntermolecularForceAnimation').then(m => ({ default: m.IntermolecularForceAnimation })),
  { ssr: false }
)

export const WaterAnomalyAnimation = dynamic(
  () => import('@/components/animations/WaterAnomalyAnimation').then(m => ({ default: m.WaterAnomalyAnimation })),
  { ssr: false }
)

export const RoutingAnimation = dynamic(
  () => import('@/components/animations/RoutingAnimation').then(m => ({ default: m.RoutingAnimation })),
  { ssr: false }
)

export const IPAddressAnimation = dynamic(
  () => import('@/components/animations/IPAddressAnimation').then(m => ({ default: m.IPAddressAnimation })),
  { ssr: false }
)

export const PacketSwitchingAnimation = dynamic(
  () => import('@/components/animations/PacketSwitchingAnimation').then(m => ({ default: m.PacketSwitchingAnimation })),
  { ssr: false }
)

export const PacketReassemblyAnimation = dynamic(
  () => import('@/components/animations/PacketReassemblyAnimation').then(m => ({ default: m.PacketReassemblyAnimation })),
  { ssr: false }
)

export const TCPHandshakeAnimation = dynamic(
  () => import('@/components/animations/TCPHandshakeAnimation').then(m => ({ default: m.TCPHandshakeAnimation })),
  { ssr: false }
)

export const CongestionControlAnimation = dynamic(
  () => import('@/components/animations/CongestionControlAnimation').then(m => ({ default: m.CongestionControlAnimation })),
  { ssr: false }
)

export const DNSResolutionAnimation = dynamic(
  () => import('@/components/animations/DNSResolutionAnimation').then(m => ({ default: m.DNSResolutionAnimation })),
  { ssr: false }
)

export const DNSHierarchyAnimation = dynamic(
  () => import('@/components/animations/DNSHierarchyAnimation').then(m => ({ default: m.DNSHierarchyAnimation })),
  { ssr: false }
)

export const HTTPRequestAnimation = dynamic(
  () => import('@/components/animations/HTTPRequestAnimation').then(m => ({ default: m.HTTPRequestAnimation })),
  { ssr: false }
)

export const CookieStateAnimation = dynamic(
  () => import('@/components/animations/CookieStateAnimation').then(m => ({ default: m.CookieStateAnimation })),
  { ssr: false }
)

export const TLSHandshakeAnimation = dynamic(
  () => import('@/components/animations/TLSHandshakeAnimation').then(m => ({ default: m.TLSHandshakeAnimation })),
  { ssr: false }
)

export const SymmetricVsAsymmetricAnimation = dynamic(
  () => import('@/components/animations/SymmetricVsAsymmetricAnimation').then(m => ({ default: m.SymmetricVsAsymmetricAnimation })),
  { ssr: false }
)

export const LoadBalancerAnimation = dynamic(
  () => import('@/components/animations/LoadBalancerAnimation').then(m => ({ default: m.LoadBalancerAnimation })),
  { ssr: false }
)

export const ReverseProxyAnimation = dynamic(
  () => import('@/components/animations/ReverseProxyAnimation').then(m => ({ default: m.ReverseProxyAnimation })),
  { ssr: false }
)

export const ChainOfTrustAnimation = dynamic(
  () => import('@/components/animations/ChainOfTrustAnimation').then(m => ({ default: m.ChainOfTrustAnimation })),
  { ssr: false }
)

export const MITMAnimation = dynamic(
  () => import('@/components/animations/MITMAnimation').then(m => ({ default: m.MITMAnimation })),
  { ssr: false }
)

export const CDNEdgeAnimation = dynamic(
  () => import('@/components/animations/CDNEdgeAnimation').then(m => ({ default: m.CDNEdgeAnimation })),
  { ssr: false }
)

export const GlobalLatencyAnimation = dynamic(
  () => import('@/components/animations/GlobalLatencyAnimation').then(m => ({ default: m.GlobalLatencyAnimation })),
  { ssr: false }
)

export const NATTranslationAnimation = dynamic(
  () => import('@/components/animations/NATTranslationAnimation').then(m => ({ default: m.NATTranslationAnimation })),
  { ssr: false }
)

export const AddressExhaustionAnimation = dynamic(
  () => import('@/components/animations/AddressExhaustionAnimation').then(m => ({ default: m.AddressExhaustionAnimation })),
  { ssr: false }
)

export const SwitchLearningAnimation = dynamic(
  () => import('@/components/animations/SwitchLearningAnimation').then(m => ({ default: m.SwitchLearningAnimation })),
  { ssr: false }
)

export const ARPAnimation = dynamic(
  () => import('@/components/animations/ARPAnimation').then(m => ({ default: m.ARPAnimation })),
  { ssr: false }
)

export const BGPRoutingAnimation = dynamic(
  () => import('@/components/animations/BGPRoutingAnimation').then(m => ({ default: m.BGPRoutingAnimation })),
  { ssr: false }
)

export const RouteHijackAnimation = dynamic(
  () => import('@/components/animations/RouteHijackAnimation').then(m => ({ default: m.RouteHijackAnimation })),
  { ssr: false }
)

export const MultiplexingAnimation = dynamic(
  () => import('@/components/animations/MultiplexingAnimation').then(m => ({ default: m.MultiplexingAnimation })),
  { ssr: false }
)

export const QUICvsTCPAnimation = dynamic(
  () => import('@/components/animations/QUICvsTCPAnimation').then(m => ({ default: m.QUICvsTCPAnimation })),
  { ssr: false }
)

export const VPNTunnelAnimation = dynamic(
  () => import('@/components/animations/VPNTunnelAnimation').then(m => ({ default: m.VPNTunnelAnimation })),
  { ssr: false }
)

export const VPNEavesdropperAnimation = dynamic(
  () => import('@/components/animations/VPNEavesdropperAnimation').then(m => ({ default: m.VPNEavesdropperAnimation })),
  { ssr: false }
)

export const WiFiContentionAnimation = dynamic(
  () => import('@/components/animations/WiFiContentionAnimation').then(m => ({ default: m.WiFiContentionAnimation })),
  { ssr: false }
)

export const SignalRangeAnimation = dynamic(
  () => import('@/components/animations/SignalRangeAnimation').then(m => ({ default: m.SignalRangeAnimation })),
  { ssr: false }
)

export const EmailDeliveryAnimation = dynamic(
  () => import('@/components/animations/EmailDeliveryAnimation').then(m => ({ default: m.EmailDeliveryAnimation })),
  { ssr: false }
)

export const EmailSpoofingAnimation = dynamic(
  () => import('@/components/animations/EmailSpoofingAnimation').then(m => ({ default: m.EmailSpoofingAnimation })),
  { ssr: false }
)

export const PingAnimation = dynamic(
  () => import('@/components/animations/PingAnimation').then(m => ({ default: m.PingAnimation })),
  { ssr: false }
)

export const TracerouteAnimation = dynamic(
  () => import('@/components/animations/TracerouteAnimation').then(m => ({ default: m.TracerouteAnimation })),
  { ssr: false }
)

export const DHCPHandshakeAnimation = dynamic(
  () => import('@/components/animations/DHCPHandshakeAnimation').then(m => ({ default: m.DHCPHandshakeAnimation })),
  { ssr: false }
)

export const DHCPLeaseAnimation = dynamic(
  () => import('@/components/animations/DHCPLeaseAnimation').then(m => ({ default: m.DHCPLeaseAnimation })),
  { ssr: false }
)

export const FirewallRulesAnimation = dynamic(
  () => import('@/components/animations/FirewallRulesAnimation').then(m => ({ default: m.FirewallRulesAnimation })),
  { ssr: false }
)

export const StatefulFirewallAnimation = dynamic(
  () => import('@/components/animations/StatefulFirewallAnimation').then(m => ({ default: m.StatefulFirewallAnimation })),
  { ssr: false }
)

export const P2PvsServerAnimation = dynamic(
  () => import('@/components/animations/P2PvsServerAnimation').then(m => ({ default: m.P2PvsServerAnimation })),
  { ssr: false }
)

export const SwarmPiecesAnimation = dynamic(
  () => import('@/components/animations/SwarmPiecesAnimation').then(m => ({ default: m.SwarmPiecesAnimation })),
  { ssr: false }
)

export const SolarSystemFormationAnimation = dynamic(
  () => import('@/components/animations/SolarSystemFormationAnimation').then(m => ({ default: m.SolarSystemFormationAnimation })),
  { ssr: false }
)

export const FrostLineAnimation = dynamic(
  () => import('@/components/animations/FrostLineAnimation').then(m => ({ default: m.FrostLineAnimation })),
  { ssr: false }
)
