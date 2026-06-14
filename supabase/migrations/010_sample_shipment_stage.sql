-- =============================================================================
-- Migration 010: First-piece review handoff stage
-- =============================================================================
-- The client reviews the factory's first-piece photos at FIRST_PIECE_REVIEW.
-- When they approve, the order moves to AWAITING_SAMPLE_SHIPMENT, where the
-- factory enters tracking and ships the physical sample (-> SAMPLE_SHIPPED).
-- This separates the client's photo approval from the factory's shipping
-- action (which requires tracking info the client doesn't have).
--
-- Safe to run multiple times.
-- =============================================================================

ALTER TYPE public.production_stage ADD VALUE IF NOT EXISTS 'AWAITING_SAMPLE_SHIPMENT';
