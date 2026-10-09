import { useRef, useState } from "react";
import type { ModelDocument, Position } from "./model.ts";
import type { Dispatch } from "./ui.ts";

export function Canvas({
  document,
  selected,
  onSelect,
  dispatch,
}: {
  document: ModelDocument;
  selected: string;
  onSelect: (id: string) => void;
  dispatch: Dispatch;
}) {
  const drag = useRef<{
    id: string;
    pointerId: number;
    clientX: number;
    clientY: number;
    origin: Position;
    position: Position;
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    position: Position;
  } | null>(null);
  const at = (id: string) =>
    preview?.id === id ? preview.position : document.layout[id];
  const width = Math.max(
    820,
    ...document.model.entities.map((e) => at(e.id).x + 320),
  );
  const height = Math.max(
    440,
    ...document.model.entities.map(
      (e) => at(e.id).y + 116 + e.fields.length * 32,
    ),
  );
  return (
    <div className="canvas-scroll">
      <div className="canvas" style={{ width, height }}>
        <svg
          width={width}
          height={height}
          className="connections"
          aria-label="One-to-many relations"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8" fill="none" stroke="#368c79" />
            </marker>
          </defs>
          {document.model.relations.map((relation) => {
            const source = at(relation.sourceEntityId);
            const target = at(relation.targetEntityId);
            const self = relation.sourceEntityId === relation.targetEntityId;
            const x1 = source.x + 258,
              y1 = source.y + 28,
              x2 = self ? target.x + 258 : target.x,
              y2 =
                target.y +
                76 +
                32 *
                  document.model.entities
                    .find((e) => e.id === relation.targetEntityId)!
                    .fields.findIndex((f) => f.id === relation.targetFieldId);
            const path = self
              ? `M ${x1} ${y1} C ${x1 + 95} ${y1 - 50}, ${x2 + 95} ${y2 + 50}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`;
            return (
              <g key={relation.id} data-testid="relation-edge">
                <title>
                  {relation.sourceEntityId} → {relation.targetEntityId} via{" "}
                  {relation.targetFieldId}
                </title>
                <path
                  d={path}
                  stroke="#368c79"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrow)"
                />
                <text x={x1 + 12} y={y1 - 10}>
                  1
                </text>
                <text x={self ? x2 + 12 : x2 - 22} y={y2 - 10}>
                  N
                </text>
              </g>
            );
          })}
        </svg>
        {document.model.entities.map((entity) => (
          <article
            key={entity.id}
            className={`entity-card ${selected === entity.id ? "active" : ""}`}
            style={{ left: at(entity.id).x, top: at(entity.id).y }}
            data-testid={`node-${entity.id}`}
            onClick={() => onSelect(entity.id)}
          >
            <button
              className="node-header"
              aria-label={`Move ${entity.name}`}
              onKeyDown={(event) => {
                const directions: Record<string, [number, number]> = {
                  ArrowLeft: [-16, 0],
                  ArrowRight: [16, 0],
                  ArrowUp: [0, -16],
                  ArrowDown: [0, 16],
                };
                const direction = directions[event.key];
                if (direction) {
                  event.preventDefault();
                  const current = document.layout[entity.id];
                  dispatch({
                    type: "moveEntity",
                    entityId: entity.id,
                    position: {
                      x: Math.max(0, Math.min(4000, current.x + direction[0])),
                      y: Math.max(0, Math.min(4000, current.y + direction[1])),
                    },
                  });
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                onSelect(entity.id);
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  id: entity.id,
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  origin: at(entity.id),
                  position: at(entity.id),
                };
              }}
              onPointerMove={(event) => {
                const moving = drag.current;
                if (
                  !moving ||
                  moving.id !== entity.id ||
                  moving.pointerId !== event.pointerId
                )
                  return;
                moving.position = {
                  x: Math.max(
                    0,
                    Math.min(
                      4000,
                      moving.origin.x + event.clientX - moving.clientX,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      4000,
                      moving.origin.y + event.clientY - moving.clientY,
                    ),
                  ),
                };
                setPreview({ id: moving.id, position: moving.position });
              }}
              onPointerUp={(event) => {
                const moving = drag.current;
                if (!moving || moving.pointerId !== event.pointerId) return;
                if (
                  moving.position.x !== moving.origin.x ||
                  moving.position.y !== moving.origin.y
                )
                  dispatch({
                    type: "moveEntity",
                    entityId: moving.id,
                    position: moving.position,
                  });
                drag.current = null;
                setPreview(null);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setPreview(null);
              }}
            >
              <span>▧</span>
              <strong>{entity.name}</strong>
              <span className="grip">⠿</span>
            </button>
            <div className="node-fields">
              {entity.fields.length === 0 ? (
                <p className="muted">Add a field in the inspector</p>
              ) : (
                entity.fields.map((field) => (
                  <div key={field.id}>
                    <span className="field-symbol">
                      {document.model.relations.some(
                        (r) => r.targetFieldId === field.id,
                      )
                        ? "↗"
                        : "·"}
                    </span>
                    <span>
                      {field.name}
                      {field.required && <b className="required"> *</b>}
                    </span>
                    <code>{field.type}</code>
                  </div>
                ))
              )}
            </div>
            <div className="node-footer">
              {
                document.model.samples.filter((s) => s.entityId === entity.id)
                  .length
              }{" "}
              sample records<span>ENTITY</span>
            </div>
          </article>
        ))}
        <span className="canvas-caption">STRUCTURE FIRST. TEST WITH DATA.</span>
      </div>
    </div>
  );
}
