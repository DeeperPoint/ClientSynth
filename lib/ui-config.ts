export const UI_CONFIG = {
  // Spacing
  spacing: {
    page: {
      mobile: "p-4",
      tablet: "md:p-6",
      desktop: "lg:p-8",
      full: "p-4 md:p-6 lg:p-8",
    },
    container: {
      mobile: "px-4",
      tablet: "md:px-6",
      desktop: "lg:px-8",
      full: "px-4 md:px-6 lg:px-8",
    },
    section: {
      small: "space-y-4",
      medium: "space-y-6",
      large: "space-y-8",
    },
    card: {
      padding: "p-6",
      gap: "gap-4",
    },
  },

  // Grid layouts
  grid: {
    cols: {
      default: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      wide: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
      narrow: "grid-cols-1 md:grid-cols-2",
    },
    gap: {
      small: "gap-4",
      medium: "gap-6",
      large: "gap-8",
    },
  },

  // Animations
  animation: {
    duration: {
      fast: "duration-150",
      normal: "duration-200",
      slow: "duration-300",
    },
    transition: "transition-all duration-200",
  },

  // Borders
  border: {
    radius: {
      small: "rounded-md",
      medium: "rounded-lg",
      large: "rounded-xl",
    },
  },
} as const
