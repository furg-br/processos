import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { ProcessRelation, ProcessSummary } from "@furg/processos-contracts";
import { relationLabels } from "@furg/processos-contracts";

export function ProcessMap({ processes, relations, onOpen }: { processes: ProcessSummary[]; relations: ProcessRelation[]; onOpen: (id: string) => void }) {
  const nodes: Node[] = processes.map((process, index) => ({
    id: process.id,
    position: { x: 80 + index * 285, y: index % 2 === 0 ? 80 : 230 },
    data: { label: <div className="map-node"><small>{process.ownerUnit.acronym}</small><strong>{process.title}</strong><span>v{process.currentVersion?.revision ?? 1} · {process.currentVersion?.perspective === "TO_BE" ? "Futuro" : "Atual"}</span></div> },
    className: `process-node process-node--${process.currentVersion?.status.toLowerCase() ?? "draft"}`,
  }));
  const edges: Edge[] = relations.map((relation) => ({
    id: relation.id, source: relation.sourceProcessId, target: relation.targetProcessId,
    label: relation.label ?? relationLabels[relation.type], type: "smoothstep", animated: relation.type === "CALLS",
    markerEnd: { type: MarkerType.ArrowClosed }, className: `relation-${relation.type.toLowerCase()}`,
  }));
  return <div className="process-map" aria-label="Mapa visual de relações entre processos">
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.45} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => onOpen(node.id)}>
      <Background gap={28} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
