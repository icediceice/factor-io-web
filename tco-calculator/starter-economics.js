// Two independently quoted request shapes, one fully charged server.
import { runComparison, paybackMonths } from "./calculator.js?v=20260906-ux3";
import { nodesForFleet } from "./capex.js?v=20260906-ux3";
import { runningCost } from "./power.js";
import { servingPlan } from "./serving.js";
import { toRat, ratStr } from "./exact.js";

function whole(value, name, max = 100000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError(`${name} must be a whole number between 0 and ${max}`);
  return value;
}

export function priceStarterRequests(shape, requests, { catalog, offerId, horizonMonths, quoteUtc, now }) {
  whole(requests, "Requests");
  for (const key of ["prompt_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"]) whole(shape[key] ?? 0, key);
  if (!requests) return { monthly: "0", quote: null };
  const result = runComparison({ catalog, laneA: null, laneC: null,
    laneB: { enabled: true, offer_ids: [offerId] },
    workload: { demand_tokens_mo: 0, request_count_mo: requests, horizon_months: horizonMonths,
      prompt_tokens: shape.prompt_tokens, output_tokens: shape.output_tokens,
      cache_read_tokens_per_req: shape.cache_read_tokens ?? 0, cache_write_tokens_per_req: shape.cache_write_tokens ?? 0,
      quote_utc: quoteUtc, now, time_buckets: null },
    routing: { policy: "api_first", failover: { fallback: "A", share: "0", rate: "0" } },
  });
  const quote = result.lanes.B.quotes[offerId];
  const missing = quote?.meters?.find(m => m.unit_price === null);
  if (!quote?.servable || quote.cost === null || missing || result.lanes.B.monthly_total === null) {
    throw new RangeError(`API price unavailable: ${missing?.meter ?? quote?.gap_reason ?? "missing quote"}`);
  }
  return { monthly: result.lanes.B.monthly_total, quote };
}

export function computeStarterCase(row, data, overrides = {}) {
  try {
    const tasks = whole(overrides.tasksMo ?? row.tasks_day * row.working_days, "Monthly tasks");
    const horizon = whole(overrides.horizonMonths ?? row.horizon_months, "Horizon", 600);
    if (!horizon) throw new RangeError("Horizon must be positive");
    const eligibility = whole(overrides.eligiblePct ?? row.eligible_pct, "Eligible percentage", 100);
    const failure = whole(overrides.failurePct ?? row.failure_pct, "Failure percentage", 100);
    const local = row.local;
    const server = data.serverPricing?.rows?.find(s => s.server_id === local.server_id);
    if (!server || server.gpu_id !== local.gpu_id || server.gpu_count !== 1) throw new RangeError("The declared single-GPU server is unavailable");
    const model = data.servingData?.models?.find(m => m.id === local.model_id);
    if (!model || local.context_tokens > model.context_max || local.prompt_tokens + local.output_tokens > local.context_tokens) throw new RangeError("Local model/context is unavailable or does not fit");
    const d = data.servingData;
    const serving = servingPlan({ model, contextTokens: String(local.context_tokens),
      bytesPerParam: d.weight_quantization[local.weight_quantization].bytes_per_param,
      kvBytesPerElement: d.kv_quantization[local.kv_quantization].bytes_per_element,
      vramGb: String(data.gpuPricing.gpus[local.gpu_id].vram_gb),
      bandwidthGbS: d.accelerators[local.gpu_id].bandwidth_gb_s,
      runtimeEfficiency: d.runtimes[local.runtime].bandwidth_efficiency,
      tpEfficiency: d.tensor_parallel.efficiency_per_extra_gpu,
      vramOverheadFraction: d.vram_overhead_fraction.value,
      maxBatch: local.concurrency, tpCandidates: [1],
    });
    // Sequential prefill + decode budget, with peak headroom; neither term is a benchmark.
    const secondsPerTask = local.prompt_tokens / local.prefill_tokens_s + local.output_tokens / Number(serving.tokens_s_per_replica.text);
    if (!(secondsPerTask > 0) || !Number.isFinite(secondsPerTask) || !(local.peak_factor >= 1)) throw new RangeError("Invalid local capacity assumptions");
    const capacity = Math.floor(local.scheduled_hours_day * 3600 * row.working_days / secondsPerTask / local.peak_factor);
    const eligible = Math.floor(tasks * eligibility / 100);
    const attempted = Math.min(eligible, capacity);
    const failed = Math.ceil(attempted * failure / 100);
    const counts = { tasks, successful: attempted - failed, bypass: tasks - eligible, failed, overflow: eligible - attempted, attempted, capacity };
    const fallbackCount = counts.bypass + counts.failed + counts.overflow;
    const quoteOptions = { catalog: data.catalog, offerId: row.premium_offer_id, horizonMonths: horizon, quoteUtc: data.quoteUtc, now: data.now };
    const baseline = priceStarterRequests(row.baseline, tasks, quoteOptions);
    const residual = priceStarterRequests(row.residual, counts.successful * whole(row.residual_requests_per_success, "Residual requests per success", 1), quoteOptions);
    const fallback = priceStarterRequests(row.baseline, fallbackCount, quoteOptions);
    const hardware = nodesForFleet({ gpusRequired: 1, server });
    const power = runningCost({ gpuId: local.gpu_id, gpusProvisioned: 1, pue: "1.4", usdPerKwh: data.usdPerKwh, nodeOverheadFraction: "0.2" });
    const afterApi = toRat(residual.monthly).add(toRat(fallback.monthly));
    const reduction = toRat(baseline.monthly).sub(afterApi);
    const savings = reduction.sub(toRat(power.monthly_usd));
    return { available: true, case_id: row.id, horizon_months: horizon, counts,
      baseline_api: baseline.monthly, residual_api: ratStr(afterApi), successful_api: residual.monthly, fallback_api: fallback.monthly,
      api_reduction: ratStr(reduction), api_reduction_pct: tasks && !toRat(baseline.monthly).isZero() ? ratStr(reduction.div(toRat(baseline.monthly)).mul(toRat("100"))) : null,
      running_cost: power.monthly_usd, capex: hardware.capex, net_monthly: ratStr(savings),
      horizon_savings: ratStr(savings.mul(toRat(String(horizon))).sub(toRat(hardware.capex))),
      payback: paybackMonths({ capex: hardware.capex, monthlyOpex: power.monthly_usd, targetMonthly: ratStr(reduction), horizonMonths: horizon }),
      hardware, power, serving, quotes: { baseline, residual, fallback },
      quote_utc: data.quoteUtc, snapshot_digest: data.manifest?.snapshot_digest ?? null,
      fx: data.fx, sources: data.manifest?.sources ?? {},
    };
  } catch (error) {
    return { available: false, case_id: row.id, reason: error.message };
  }
}
