import { useEffect, useRef, useState } from "react"
import type { CountryPopulations } from "../../../../packages/game/population.ts"
import type { Atlas } from "./atlas"
import type { PopulationPointCloud, PopulationWorkerRequest, PopulationWorkerResponse } from "./population-points"

interface PopulationJob {
  readonly version: number
  readonly scope: string
  readonly populations: CountryPopulations
}

interface PopulationResult {
  readonly atlas: Atlas
  readonly scope: string
  readonly cloud: PopulationPointCloud
}

export function usePopulationPoints(atlas: Atlas, scope: string | null, populations: CountryPopulations) {
  const [result, setResult] = useState<PopulationResult | null>(null)
  const submit = useRef<(scope: string | null, populations: CountryPopulations) => void>(null)

  useEffect(() => {
    let worker: Worker | null = null
    let version = 0
    let inFlight: PopulationJob | null = null
    let pending: PopulationJob | null = null
    let failed = false

    function stop() {
      failed = true
      worker?.terminate()
      worker = null
      inFlight = pending = null
    }

    function fail() {
      stop()
      setResult(null)
    }

    function pump() {
      if (!pending || inFlight || failed) return
      try {
        if (!worker) {
          worker = new Worker(new URL("./population.worker.ts", import.meta.url), { type: "module" })
          worker.onmessage = ({ data }: MessageEvent<PopulationWorkerResponse>) => {
            const finished = inFlight
            if (!finished || data.version !== finished.version) return
            inFlight = null
            if (finished.version === version) setResult({ atlas, scope: finished.scope, cloud: data.cloud })
            pump()
          }
          worker.onerror = fail
          worker.onmessageerror = fail
          const countries = atlas.countries.map(({ id, box, d }) => ({ id, box, d }))
          const heights = atlas.heights.slice()
          worker.postMessage({ type: "init", countries, heights } satisfies PopulationWorkerRequest, [heights.buffer])
        }

        const job = pending
        pending = null
        inFlight = job
        worker.postMessage({ type: "update", version: job.version, populations: job.populations } satisfies PopulationWorkerRequest)
      } catch {
        fail()
      }
    }

    // Keep only the newest waiting snapshot while the worker completes a request.
    submit.current = (scope, populations) => {
      version++
      pending = scope === null ? null : { version, scope, populations }
      if (scope === null) setResult(null)
      pump()
    }
    return () => {
      submit.current = null
      stop()
    }
  }, [atlas])

  useEffect(() => { submit.current?.(scope, populations) }, [atlas, scope, populations])

  return result?.atlas === atlas && result.scope === scope ? result.cloud : null
}
