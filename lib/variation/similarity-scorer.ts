export interface SimilarityOptions {
  textSimilarityThreshold: number
  numericSimilarityThreshold: number
  structuralWeight: number
  contentWeight: number
}

export interface SimilarityScore {
  overall: number
  structural: number
  content: number
  details: {
    fieldMatches: number
    valueMatches: number
    typeMatches: number
    patternMatches: number
  }
}

export class SimilarityScorer {
  private defaultOptions: SimilarityOptions = {
    textSimilarityThreshold: 0.8,
    numericSimilarityThreshold: 0.1,
    structuralWeight: 0.4,
    contentWeight: 0.6,
  }

  calculateRecordSimilarity(
    record1: Record<string, any>,
    record2: Record<string, any>,
    options?: Partial<SimilarityOptions>,
  ): SimilarityScore {
    const opts = { ...this.defaultOptions, ...options }

    console.log("[v0] Calculating record similarity")

    // Structural similarity (field names and types)
    const structural = this.calculateStructuralSimilarity(record1, record2)

    // Content similarity (actual values)
    const content = this.calculateContentSimilarity(record1, record2, opts)

    // Overall weighted score
    const overall = structural.score * opts.structuralWeight + content.score * opts.contentWeight

    console.log(
      "[v0] Similarity scores - Overall:",
      overall.toFixed(3),
      "Structural:",
      structural.score.toFixed(3),
      "Content:",
      content.score.toFixed(3),
    )

    return {
      overall,
      structural: structural.score,
      content: content.score,
      details: {
        fieldMatches: structural.fieldMatches,
        valueMatches: content.valueMatches,
        typeMatches: structural.typeMatches,
        patternMatches: content.patternMatches,
      },
    }
  }

  calculateDatasetSimilarity(
    dataset1: Record<string, any>[],
    dataset2: Record<string, any>[],
    options?: Partial<SimilarityOptions>,
  ): {
    averageSimilarity: number
    maxSimilarity: number
    minSimilarity: number
    similarRecordPairs: number
    threshold: number
  } {
    console.log("[v0] Calculating dataset similarity - Dataset1:", dataset1.length, "Dataset2:", dataset2.length)

    if (dataset1.length === 0 || dataset2.length === 0) {
      return {
        averageSimilarity: 0,
        maxSimilarity: 0,
        minSimilarity: 0,
        similarRecordPairs: 0,
        threshold: 0.7,
      }
    }

    const similarities: number[] = []
    const threshold = 0.7
    let similarPairs = 0

    // Compare each record in dataset1 with each record in dataset2
    dataset1.forEach((record1, i) => {
      dataset2.forEach((record2, j) => {
        const similarity = this.calculateRecordSimilarity(record1, record2, options)
        similarities.push(similarity.overall)

        if (similarity.overall > threshold) {
          similarPairs++
        }
      })
    })

    const averageSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
    const maxSimilarity = Math.max(...similarities)
    const minSimilarity = Math.min(...similarities)

    console.log(
      "[v0] Dataset similarity analysis complete - Average:",
      averageSimilarity.toFixed(3),
      "Similar pairs:",
      similarPairs,
    )

    return {
      averageSimilarity,
      maxSimilarity,
      minSimilarity,
      similarRecordPairs: similarPairs,
      threshold,
    }
  }

  private calculateStructuralSimilarity(
    record1: Record<string, any>,
    record2: Record<string, any>,
  ): {
    score: number
    fieldMatches: number
    typeMatches: number
  } {
    const fields1 = Object.keys(record1)
    const fields2 = Object.keys(record2)

    // Field name similarity
    const commonFields = fields1.filter((field) => fields2.includes(field))
    const fieldSimilarity = commonFields.length / Math.max(fields1.length, fields2.length)

    // Type similarity for common fields
    let typeMatches = 0
    commonFields.forEach((field) => {
      const type1 = this.getValueType(record1[field])
      const type2 = this.getValueType(record2[field])
      if (type1 === type2) {
        typeMatches++
      }
    })

    const typeSimilarity = commonFields.length > 0 ? typeMatches / commonFields.length : 0

    // Combined structural score
    const score = fieldSimilarity * 0.6 + typeSimilarity * 0.4

    return {
      score,
      fieldMatches: commonFields.length,
      typeMatches,
    }
  }

  private calculateContentSimilarity(
    record1: Record<string, any>,
    record2: Record<string, any>,
    options: SimilarityOptions,
  ): {
    score: number
    valueMatches: number
    patternMatches: number
  } {
    const commonFields = Object.keys(record1).filter((field) => field in record2)

    if (commonFields.length === 0) {
      return { score: 0, valueMatches: 0, patternMatches: 0 }
    }

    let totalSimilarity = 0
    let valueMatches = 0
    let patternMatches = 0

    commonFields.forEach((field) => {
      const value1 = record1[field]
      const value2 = record2[field]

      const fieldSimilarity = this.calculateFieldSimilarity(value1, value2, options)
      totalSimilarity += fieldSimilarity

      if (fieldSimilarity > 0.9) valueMatches++
      if (fieldSimilarity > 0.5) patternMatches++
    })

    const score = totalSimilarity / commonFields.length

    return {
      score,
      valueMatches,
      patternMatches,
    }
  }

  private calculateFieldSimilarity(value1: any, value2: any, options: SimilarityOptions): number {
    // Handle null/undefined values
    if (value1 == null && value2 == null) return 1
    if (value1 == null || value2 == null) return 0

    const type1 = this.getValueType(value1)
    const type2 = this.getValueType(value2)

    // Different types have low similarity
    if (type1 !== type2) return 0.1

    switch (type1) {
      case "string":
        return this.calculateStringSimilarity(String(value1), String(value2), options.textSimilarityThreshold)

      case "number":
        return this.calculateNumericSimilarity(Number(value1), Number(value2), options.numericSimilarityThreshold)

      case "boolean":
        return value1 === value2 ? 1 : 0

      case "array":
        return this.calculateArraySimilarity(value1, value2)

      case "object":
        return this.calculateObjectSimilarity(value1, value2, options)

      default:
        return String(value1) === String(value2) ? 1 : 0
    }
  }

  private calculateStringSimilarity(str1: string, str2: string, threshold: number): number {
    if (str1 === str2) return 1
    if (str1.length === 0 && str2.length === 0) return 1
    if (str1.length === 0 || str2.length === 0) return 0

    // Levenshtein distance-based similarity
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
    const maxLength = Math.max(str1.length, str2.length)
    const similarity = 1 - distance / maxLength

    return similarity >= threshold ? similarity : similarity * 0.5 // Penalize below threshold
  }

  private calculateNumericSimilarity(num1: number, num2: number, threshold: number): number {
    if (num1 === num2) return 1

    const diff = Math.abs(num1 - num2)
    const avg = (Math.abs(num1) + Math.abs(num2)) / 2

    if (avg === 0) return num1 === num2 ? 1 : 0

    const relativeDiff = diff / avg
    return relativeDiff <= threshold ? 1 - relativeDiff : 0
  }

  private calculateArraySimilarity(arr1: any[], arr2: any[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1
    if (arr1.length === 0 || arr2.length === 0) return 0

    const intersection = arr1.filter((item) => arr2.includes(item))
    const union = [...new Set([...arr1, ...arr2])]

    return intersection.length / union.length
  }

  private calculateObjectSimilarity(
    obj1: Record<string, any>,
    obj2: Record<string, any>,
    options: SimilarityOptions,
  ): number {
    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)
    const commonKeys = keys1.filter((key) => keys2.includes(key))

    if (commonKeys.length === 0) return 0

    let totalSimilarity = 0
    commonKeys.forEach((key) => {
      totalSimilarity += this.calculateFieldSimilarity(obj1[key], obj2[key], options)
    })

    const keySimilarity = commonKeys.length / Math.max(keys1.length, keys2.length)
    const valueSimilarity = totalSimilarity / commonKeys.length

    return keySimilarity * 0.3 + valueSimilarity * 0.7
  }

  private getValueType(value: any): string {
    if (value === null || value === undefined) return "null"
    if (Array.isArray(value)) return "array"
    return typeof value
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null))

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        )
      }
    }

    return matrix[str2.length][str1.length]
  }

  generateSimilarityReport(scores: SimilarityScore[]): {
    summary: string
    recommendations: string[]
    statistics: {
      averageOverall: number
      highSimilarityCount: number
      lowSimilarityCount: number
    }
  } {
    console.log("[v0] Generating similarity report for", scores.length, "comparisons")

    if (scores.length === 0) {
      return {
        summary: "No similarity data available",
        recommendations: ["Generate more data to analyze similarity patterns"],
        statistics: { averageOverall: 0, highSimilarityCount: 0, lowSimilarityCount: 0 },
      }
    }

    const averageOverall = scores.reduce((sum, score) => sum + score.overall, 0) / scores.length
    const highSimilarityCount = scores.filter((score) => score.overall > 0.7).length
    const lowSimilarityCount = scores.filter((score) => score.overall < 0.3).length

    const summary = `Analyzed ${scores.length} record comparisons. Average similarity: ${(averageOverall * 100).toFixed(1)}%. ${highSimilarityCount} high similarity pairs, ${lowSimilarityCount} low similarity pairs.`

    const recommendations: string[] = []

    if (highSimilarityCount > scores.length * 0.3) {
      recommendations.push("High similarity detected - consider increasing seed variety")
      recommendations.push("Use different generation parameters to increase diversity")
    }

    if (lowSimilarityCount > scores.length * 0.7) {
      recommendations.push("Very low similarity - data appears highly diverse")
      recommendations.push("Current generation settings produce good variation")
    } else {
      recommendations.push("Moderate similarity levels - consider fine-tuning for optimal balance")
    }

    console.log("[v0] Similarity report generated")

    return {
      summary,
      recommendations,
      statistics: {
        averageOverall,
        highSimilarityCount,
        lowSimilarityCount,
      },
    }
  }
}
