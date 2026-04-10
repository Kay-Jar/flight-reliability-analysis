import React, { createContext, useContext, useMemo, useState } from 'react'

const defaultFilters = {
  airlines: ['Delta Air Lines Inc.', 'United Air Lines Inc.', 'Southwest Airlines Co.'],
  airports: ['ATL', 'ORD'],
  delay_types: ['Weather', 'Aircraft'],
  start_date: '',
  end_date: '',
  metric: 'avg_arr_delay',
  view: 'heatmap',
}

const FiltersContext = createContext(null)

export const FiltersProvider = ({ children }) => {
  const [filters, setFilters] = useState(defaultFilters)

  const value = useMemo(() => ({ filters, setFilters }), [filters])

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}

export const useFilters = () => {
  const context = useContext(FiltersContext)

  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider')
  }

  return context
}
