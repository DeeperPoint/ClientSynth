import { SchemaBuilder } from "@/components/schema-builder"

export default function NewSchemaPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Create New Schema</h1>
        <p className="text-muted-foreground mt-2">Design your data structure for synthetic client generation</p>
      </div>
      <SchemaBuilder />
    </div>
  )
}
