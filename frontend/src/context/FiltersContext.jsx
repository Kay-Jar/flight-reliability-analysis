import React, { createContext, useContext, useMemo, useState } from 'react'

export const defaultFilters = {
  airlines: [],
  op_airlines: [],
  airports: [],
  delay_types: [],
  tiers: [],
  metric: 'avg_arr_delay',
  table_view: 'carrier_summary',
}

const FiltersContext = createContext(null)

export const FiltersProvider = ({ children }) => {
  const [filters, setFilters] = useState(defaultFilters)
  const [queryMode, setQueryMode] = useState('manual')

  const updateFilters = (updates) => {
    setFilters((currentFilters) => ({
      ...currentFilters,
      ...updates,
    }))
  }

  const resetFilters = () => {
    setFilters(defaultFilters)
  }

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      updateFilters,
      resetFilters,
      queryMode,
      setQueryMode,
    }),
    [filters, queryMode],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}

export const useFilters = () => {
  const context = useContext(FiltersContext)

  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider')
  }

  return context
}
