import Link from 'next/link'
import type { ComponentProps } from 'react'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { ReadingProgress } from '@/components/ReadingProgress'
import { TopicBadge } from '@/components/TopicBadge'
import { ShareButtons } from '@/components/ShareButtons'
import { RelatedPosts } from '@/components/RelatedPosts'
import { TagList } from '@/components/TagList'
import { ArticleVisual } from '@/components/ArticleVisual'
import { TableOfContents } from '@/components/TableOfContents'
import { Quiz } from '@/components/Quiz'
import { PathNav } from '@/components/PathNav'
import { extractHeadings, rehypeSlugSimple } from '@/lib/toc'
import type { Metadata } from 'next'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { ProseAnimator } from '@/components/ProseAnimator'
import { KeyTakeaways } from '@/components/KeyTakeaways'
import { SITE_URL } from '@/lib/site'
import {
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
  FourierPhasesAnimation,
  SievePrimeGapAnimation,
  SortingComplexityAnimation,
  TaylorAnimation,
  PendulumAnimation,
  BinarySearchAnimation,
  ActionPotentialAnimation,
  NewtonMethodAnimation,
  EulersFormulaAnimation,
  TimeDilationAnimation,
  GraphTraversalAnimation,
  BrownianMotionAnimation,
  CLTAnimation,
  BinarySearchGrowthAnimation,
  PendulumPeriodAnimation,
  NeuronThresholdAnimation,
  DiffusionScalingAnimation,
  ECGTraceAnimation,
  StandardErrorAnimation,
  PhasorWaveAnimation,
  ShortestPathGridAnimation,
  NewtonConvergenceAnimation,
  LorentzFactorAnimation,
  SingleParticleBuildupAnimation,
  TaylorRadiusAnimation,
  BayesTheoremAnimation,
  BayesUpdateAnimation,
  DynamicProgrammingAnimation,
  MemoizationTreeAnimation,
  EntropyAnimation,
  MicrostatesAnimation,
  ImmuneResponseAnimation,
  ClonalSelectionAnimation,
  GradientDescentAnimation,
  LearningRateAnimation,
  KeplerOrbitAnimation,
  HarmonicLawAnimation,
  EigenvectorAnimation,
  PowerIterationAnimation,
  PharmacokineticsAnimation,
  HalfLifeAnimation,
  HashTableAnimation,
  LoadFactorAnimation,
  MarkovChainAnimation,
  StationaryDistributionAnimation,
  DopplerAnimation,
  RedshiftAnimation,
  DiffieHellmanAnimation,
  ModularExponentiationAnimation,
  LogisticMapAnimation,
  ButterflyEffectAnimation,
  ShannonEntropyAnimation,
  HuffmanCodingAnimation,
  GlucoseInsulinAnimation,
  FeedbackLoopAnimation,
  SuperconductivityAnimation,
  MeissnerEffectAnimation,
  NeuralNetworkAnimation,
  BackpropagationAnimation,
  DNAReplicationAnimation,
  ProofreadingAnimation,
  ComplexityGrowthAnimation,
  SATReductionAnimation,
  NashEquilibriumAnimation,
  EvolutionaryGameAnimation,
  DerivativeAnimation,
  DerivativeFunctionAnimation,
  HaltingProblemAnimation,
  TerminationAnimation,
  SIRModelAnimation,
  HerdImmunityAnimation,
  ResonanceAnimation,
  StandingWaveAnimation,
  ElectromagneticWaveAnimation,
  SpectrumAnimation,
  EquilibriumAnimation,
  LeChatelierAnimation,
  ChemicalBondAnimation,
  ElectronegativityAnimation,
  PHScaleAnimation,
  TitrationAnimation,
  GalvanicCellAnimation,
  CellPotentialAnimation,
  ReactionRateAnimation,
  CatalysisAnimation,
  AtomicOrbitalAnimation,
  PeriodicTrendsAnimation,
  ReynoldsAnimation,
  LaminarTurbulentAnimation,
  PhaseTransitionAnimation,
  PhaseDiagramAnimation,
  ProteinFoldingAnimation,
  EnergyLandscapeAnimation,
  ConsensusAnimation,
  QuorumAnimation,
  CarbonCycleAnimation,
  KeelingCurveAnimation,
  GreenhouseEffectAnimation,
  RadiationSpectrumAnimation,
  OceanCirculationAnimation,
  ThermohalineAnimation,
  ConvectionAnimation,
  CirculationCellsAnimation,
  PlateTectonicsAnimation,
  SeafloorSpreadingAnimation,
  NaturalSelectionAnimation,
  GeneticDriftAnimation,
  MilankovitchAnimation,
  IceCoreAnimation,
  PhotosynthesisAnimation,
  CalvinCycleAnimation,
  SeismicWaveAnimation,
  EarthInteriorAnimation,
  AntibioticResistanceAnimation,
  HorizontalTransferAnimation,
  MRIAnimation,
  KSpaceAnimation,
  ComplexPlaneAnimation,
  RootsOfUnityAnimation,
  FiniteAutomatonAnimation,
  PumpingLemmaAnimation,
  BindingEnergyAnimation,
  ChainReactionAnimation,
  RespirationAnimation,
  ETCAnimation,
  KineticTheoryAnimation,
  MaxwellBoltzmannAnimation,
  BlackHoleAnimation,
  GravitationalTimeDilationAnimation,
  TransitMethodAnimation,
  RadialVelocityAnimation,
} from '@/components/ArticleAnimations'

// Markdown links compile to raw <a> elements, and Next only applies basePath to
// next/link — under a subpath deploy every in-article cross-link would 404.
// Route internal hrefs through Link; leave external ones alone (but make them
// safe to open in a new tab).
function MdxLink({ href = '', children, ...rest }: ComponentProps<'a'>) {
  if (href.startsWith('/')) {
    return <Link href={href} {...rest}>{children}</Link>
  }
  const isExternal = /^https?:\/\//.test(href)
  return (
    <a href={href} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {children}
    </a>
  )
}

const components = {
  a: MdxLink,
  SieveAnimation,
  FourierAnimation,
  SortingAnimation,
  DoubleSlitAnimation,
  CardiacAnimation,
  FourierPhasesAnimation,
  SievePrimeGapAnimation,
  SortingComplexityAnimation,
  TaylorAnimation,
  PendulumAnimation,
  BinarySearchAnimation,
  ActionPotentialAnimation,
  NewtonMethodAnimation,
  EulersFormulaAnimation,
  TimeDilationAnimation,
  GraphTraversalAnimation,
  BrownianMotionAnimation,
  CLTAnimation,
  BinarySearchGrowthAnimation,
  PendulumPeriodAnimation,
  NeuronThresholdAnimation,
  DiffusionScalingAnimation,
  ECGTraceAnimation,
  StandardErrorAnimation,
  PhasorWaveAnimation,
  ShortestPathGridAnimation,
  NewtonConvergenceAnimation,
  LorentzFactorAnimation,
  SingleParticleBuildupAnimation,
  TaylorRadiusAnimation,
  BayesTheoremAnimation,
  BayesUpdateAnimation,
  DynamicProgrammingAnimation,
  MemoizationTreeAnimation,
  EntropyAnimation,
  MicrostatesAnimation,
  ImmuneResponseAnimation,
  ClonalSelectionAnimation,
  GradientDescentAnimation,
  LearningRateAnimation,
  KeplerOrbitAnimation,
  HarmonicLawAnimation,
  EigenvectorAnimation,
  PowerIterationAnimation,
  PharmacokineticsAnimation,
  HalfLifeAnimation,
  HashTableAnimation,
  LoadFactorAnimation,
  MarkovChainAnimation,
  StationaryDistributionAnimation,
  DopplerAnimation,
  RedshiftAnimation,
  DiffieHellmanAnimation,
  ModularExponentiationAnimation,
  LogisticMapAnimation,
  ButterflyEffectAnimation,
  ShannonEntropyAnimation,
  HuffmanCodingAnimation,
  GlucoseInsulinAnimation,
  FeedbackLoopAnimation,
  SuperconductivityAnimation,
  MeissnerEffectAnimation,
  NeuralNetworkAnimation,
  BackpropagationAnimation,
  DNAReplicationAnimation,
  ProofreadingAnimation,
  ComplexityGrowthAnimation,
  SATReductionAnimation,
  NashEquilibriumAnimation,
  EvolutionaryGameAnimation,
  DerivativeAnimation,
  DerivativeFunctionAnimation,
  HaltingProblemAnimation,
  TerminationAnimation,
  SIRModelAnimation,
  HerdImmunityAnimation,
  ResonanceAnimation,
  StandingWaveAnimation,
  ElectromagneticWaveAnimation,
  SpectrumAnimation,
  EquilibriumAnimation,
  LeChatelierAnimation,
  ChemicalBondAnimation,
  ElectronegativityAnimation,
  PHScaleAnimation,
  TitrationAnimation,
  GalvanicCellAnimation,
  CellPotentialAnimation,
  ReactionRateAnimation,
  CatalysisAnimation,
  AtomicOrbitalAnimation,
  PeriodicTrendsAnimation,
  ReynoldsAnimation,
  LaminarTurbulentAnimation,
  PhaseTransitionAnimation,
  PhaseDiagramAnimation,
  ProteinFoldingAnimation,
  EnergyLandscapeAnimation,
  ConsensusAnimation,
  QuorumAnimation,
  CarbonCycleAnimation,
  KeelingCurveAnimation,
  GreenhouseEffectAnimation,
  RadiationSpectrumAnimation,
  OceanCirculationAnimation,
  ThermohalineAnimation,
  ConvectionAnimation,
  CirculationCellsAnimation,
  PlateTectonicsAnimation,
  SeafloorSpreadingAnimation,
  NaturalSelectionAnimation,
  GeneticDriftAnimation,
  MilankovitchAnimation,
  IceCoreAnimation,
  PhotosynthesisAnimation,
  CalvinCycleAnimation,
  SeismicWaveAnimation,
  EarthInteriorAnimation,
  AntibioticResistanceAnimation,
  HorizontalTransferAnimation,
  MRIAnimation,
  KSpaceAnimation,
  ComplexPlaneAnimation,
  RootsOfUnityAnimation,
  FiniteAutomatonAnimation,
  PumpingLemmaAnimation,
  BindingEnergyAnimation,
  ChainReactionAnimation,
  RespirationAnimation,
  ETCAnimation,
  KineticTheoryAnimation,
  MaxwellBoltzmannAnimation,
  BlackHoleAnimation,
  GravitationalTimeDilationAnimation,
  TransitMethodAnimation,
  RadialVelocityAnimation,
  KeyTakeaways,
}

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map(a => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { meta } = await getArticleBySlug(slug)
  const title = `${meta.title} — Scimotion`
  return {
    title,
    description: meta.description,
    alternates: { canonical: `${SITE_URL}/articles/${slug}` },
    openGraph: {
      type: 'article',
      title,
      description: meta.description,
      url: `${SITE_URL}/articles/${slug}`,
      siteName: 'Scimotion',
      publishedTime: meta.date,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const { meta, content, quiz } = await getArticleBySlug(slug)
  const allArticles = await getAllArticles()
  const url = `${SITE_URL}/articles/${slug}`
  const headings = extractHeadings(content)

  return (
    <>
      <ReadingProgress />
      {/* Grid rather than flex so the column widths are declared rather than
          emergent. The old flex layout asked for 224 + 680 + 224 + 80 of gap =
          1208px inside a max-w-[1100px] container, so the article — the only
          shrinkable item — was silently squeezed to ~530px.

          The measure is what matters: ~68 characters here, inside the 45-75
          readability band. That is why the column and the body size were raised
          together (620px at 1.125rem) — widening the column alone would have
          pushed the line length past 80 characters and hurt readability. */}
      <div className="max-w-[1190px] mx-auto px-5 py-12 grid gap-10 grid-cols-1 justify-center xl:grid-cols-[14rem_minmax(0,620px)_14rem]">
        <aside className="hidden xl:block">
          <div className="sticky top-20">
            <TableOfContents headings={headings} />
          </div>
        </aside>
        <article className="w-full max-w-[620px] mx-auto min-w-0">
        {/* Hero */}
        <div className="mb-8 rounded-2xl overflow-hidden border border-border">
          <ArticleVisual slug={slug} topic={meta.topic} variant="hero" />
        </div>
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4">
            <TopicBadge topic={meta.topic} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2" style={{ letterSpacing: '-0.3px' }}>
            {meta.title}
          </h1>
          <p className="text-text-secondary text-base mb-4">{meta.subtitle}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted uppercase tracking-wider">
            <span>{meta.readTime} min read</span>
            <span>·</span>
            <span>{new Date(meta.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        <hr className="border-border mb-8" />

        {/* Body */}
        <ProseAnimator />
        <div className="prose-article">
          <MDXRemote
            source={content}
            components={components}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkMath],
                rehypePlugins: [rehypeSlugSimple, rehypeKatex],
              },
            }}
          />
        </div>

        <Quiz questions={quiz} />

        <PathNav slug={slug} allArticles={allArticles} />

        <hr className="border-border mt-8" />

        <div className="mt-8">
          <TagList tags={meta.tags} />
        </div>

        <ShareButtons title={meta.title} url={url} />
        <RelatedPosts current={meta} allArticles={allArticles} />
        </article>
        {/* Empty rail: balances the TOC so the prose sits at the true page centre. */}
        <div className="hidden xl:block" aria-hidden="true" />
      </div>
    </>
  )
}
