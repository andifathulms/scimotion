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
