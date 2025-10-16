import { NextResponse, type NextRequest } from "next/server"
import { query } from "@/lib/postgres/client"

type Body = {
	action: "select" | "insert" | "update" | "delete"
	table: string
	columns?: string
	where?: { op: "eq"; column: string; value: any } | { op: "in"; column: string; values: any[] }
	orderBy?: { column: string; ascending: boolean }
	limitCount?: number
	data?: any
	returning?: string
	single?: boolean
}

function isSafeIdentifier(id: string) {
	return /^[a-zA-Z0-9_]+$/.test(id)
}

export async function POST(req: NextRequest) {
	try {
		const raw = await req.json()
		// Back-compat shim: accept legacy { op, filters, order, limit, values } from Supabase shim
		const body: Body = {
			action: (raw.action || raw.op) as any,
			table: raw.table,
			columns: raw.columns,
			where: raw.where || (raw.filters && Array.isArray(raw.filters) && raw.filters[0]
				? (raw.filters[0].type === 'eq'
					? { op: 'eq', column: raw.filters[0].column, value: raw.filters[0].value }
					: raw.filters[0].type === 'in'
						? { op: 'in', column: raw.filters[0].column, values: raw.filters[0].value }
						: undefined)
				: undefined),
			orderBy: raw.order || raw.orderBy,
			limitCount: raw.limit || raw.limitCount,
			data: raw.data || raw.values,
			returning: raw.returning,
			single: raw.single === true,
		}

		if (!body || !body.table || !isSafeIdentifier(body.table)) {
			return NextResponse.json({ error: "Invalid table" }, { status: 400 })
		}

		const table = body.table

		if (body.action === "select") {
			const cols = body.columns && body.columns.trim().length > 0 ? body.columns : "*"
			const where = body.where
			const order = body.orderBy
			const limitCount = body.limitCount
			let sql = `SELECT ${cols} FROM ${table}`
			const params: any[] = []

			if (where) {
				if (where.op === "eq") {
					sql += ` WHERE ${where.column} = $1`
					params.push(where.value)
				} else if (where.op === "in" && Array.isArray(where.values) && where.values.length > 0) {
					const placeholders = where.values.map((_, i) => `$${i + 1}`).join(",")
					sql += ` WHERE ${where.column} IN (${placeholders})`
					params.push(...where.values)
				}
			}

			if (order) {
				sql += ` ORDER BY ${order.column} ${order.ascending ? "ASC" : "DESC"}`
			}
			if (typeof limitCount === "number") {
				sql += ` LIMIT ${limitCount}`
			}

			const result = await query(sql, params)
			const rows = result.rows
			return NextResponse.json({ data: body.single ? rows[0] ?? null : rows })
		}

		if (body.action === "insert") {
			if (!body.data || typeof body.data !== "object") {
				return NextResponse.json({ error: "Missing insert data" }, { status: 400 })
			}
			const keys = Object.keys(body.data)
			const values = Object.values(body.data)
			const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ")
			const returning = body.returning || "*"
			const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING ${returning}`
			const result = await query(sql, values)
			return NextResponse.json({ data: result.rows[0] })
		}

		if (body.action === "update") {
			if (!body.data || typeof body.data !== "object" || !body.where || (body.where as any).op !== "eq") {
				return NextResponse.json({ error: "Missing update data/where" }, { status: 400 })
			}
			const keys = Object.keys(body.data)
			const values = Object.values(body.data)
			const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ")
			const sql = `UPDATE ${table} SET ${setClause} WHERE ${(body.where as any).column} = $${keys.length + 1} RETURNING *`
			const result = await query(sql, [...values, (body.where as any).value])
			return NextResponse.json({ data: result.rows[0] ?? null })
		}

		if (body.action === "delete") {
			if (!body.where || (body.where as any).op !== "eq") {
				return NextResponse.json({ error: "Missing delete where" }, { status: 400 })
			}
			const sql = `DELETE FROM ${table} WHERE ${(body.where as any).column} = $1 RETURNING *`
			const result = await query(sql, [(body.where as any).value])
			return NextResponse.json({ data: result.rows[0] ?? null })
		}

		return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
	} catch (error: any) {
		console.error("/api/db error:", error)
		return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 })
	}
}
