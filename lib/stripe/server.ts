// Server-only Stripe client. apiVersion is pinned to whatever the
// installed Stripe-node version ships as its latest — Stripe@22.1.1
// currently bakes in "2026-04-22.dahlia", and Stripe.LatestApiVersion
// is the matching type so casts like this stay typechecked across upgrades.

import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  throw new Error("Missing STRIPE_SECRET_KEY — required for the invoice payment flow.");
}

// Stripe-node's static API_VERSION is the runtime constant — keeps us
// pinned to whatever the installed SDK was built against without having
// to hardcode the version string and re-edit on every dep bump.
export const STRIPE_API_VERSION = Stripe.API_VERSION;

export const stripe = new Stripe(secret, {
  apiVersion: STRIPE_API_VERSION,
});
