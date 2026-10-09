import type { ModelDocument } from "./model.ts";

/** Entirely fictional data, intentionally includes three fixable validation issues. */
export function createDemo(): ModelDocument {
  return {
    documentVersion: 1,
    model: {
      entities: [
        {
          id: "customer",
          name: "Customer",
          fields: [
            {
              id: "customer_name",
              name: "Name",
              type: "string",
              required: true,
            },
            {
              id: "customer_active",
              name: "Active",
              type: "boolean",
              required: false,
            },
          ],
        },
        {
          id: "project",
          name: "Project",
          fields: [
            {
              id: "project_title",
              name: "Title",
              type: "string",
              required: true,
            },
            {
              id: "project_budget",
              name: "Budget",
              type: "number",
              required: false,
            },
            {
              id: "project_customer",
              name: "Customer ID",
              type: "string",
              required: true,
            },
          ],
        },
      ],
      relations: [
        {
          id: "customer_projects",
          sourceEntityId: "customer",
          targetEntityId: "project",
          targetFieldId: "project_customer",
        },
      ],
      samples: [
        {
          id: "customer_acorn",
          entityId: "customer",
          values: { customer_name: "Acorn Studio", customer_active: true },
        },
        {
          id: "customer_lumen",
          entityId: "customer",
          values: { customer_name: "Lumen Works", customer_active: false },
        },
        {
          id: "project_garden",
          entityId: "project",
          values: {
            project_title: "Community garden",
            project_budget: 12000,
            project_customer: "customer_acorn",
          },
        },
        {
          id: "project_draft",
          entityId: "project",
          values: {
            project_title: "",
            project_budget: "twelve",
            project_customer: "customer_missing",
          },
        },
      ],
    },
    layout: { customer: { x: 64, y: 64 }, project: { x: 438, y: 214 } },
  };
}
