import { createPopulationPointBuilder, type PopulationWorkerRequest, type PopulationWorkerResponse } from "./population-points.ts"

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PopulationWorkerRequest>) => void) | null
  postMessage(message: PopulationWorkerResponse, transfer: Transferable[]): void
}

let build: ReturnType<typeof createPopulationPointBuilder> | undefined
scope.onmessage = ({ data }) => {
  if (data.type === "init") {
    build = createPopulationPointBuilder(data.countries, data.heights)
  } else if (build) {
    const cloud = build(data.populations)
    scope.postMessage({ version: data.version, cloud }, [cloud.positions.buffer, cloud.colors.buffer])
  }
}
