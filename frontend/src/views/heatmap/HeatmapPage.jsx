import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'
import Plot from 'react-plotly.js'

import { useFilters } from '../../context/FiltersContext'
import { API_BASE_URL } from '../../config/api'

const displayValue = (value) => (value === 0 ? '0' : value || '-')

const formatErrorDetail = (detail) => {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object') {
          const location = Array.isArray(item.loc) ? item.loc.join('.') : ''
          const message = item.msg || item.message || 'Invalid value'
          return location ? `${location}: ${message}` : message
        }

        return String(item)
      })
      .join('; ')
  }

  if (typeof detail === 'string') {
    return detail
  }

  return 'Request failed.'
}

const getPointValue = (value) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const getPointFlightCount = (point) => {
  const rawCount = point?.flight_count ?? point?.count ?? point?.total_flights
  const numericCount = Number(rawCount)
  return Number.isFinite(numericCount) ? numericCount : null
}

const getMetricDisplay = (metric) => {
  if (metric === 'total_flights') {
    return {
      colorbarTitle: 'Flights (count)',
      valueLabel: 'Flights',
      valueUnit: '(count)',
    }
  }

  return {
    colorbarTitle: 'Delay (min)',
    valueLabel: 'Delay',
    valueUnit: '(min)',
  }
}

const buildHeatmapMatrix = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return null
  }

  const xLabels = []
  const yLabels = []
  const xIndex = new Map()
  const yIndex = new Map()

  points.forEach((point) => {
    const xLabel = point?.x ?? 'Unknown'
    const yLabel = point?.y ?? 'Unknown'

    if (!xIndex.has(xLabel)) {
      xIndex.set(xLabel, xLabels.length)
      xLabels.push(xLabel)
    }

    if (!yIndex.has(yLabel)) {
      yIndex.set(yLabel, yLabels.length)
      yLabels.push(yLabel)
    }
  })

  const z = yLabels.map(() => Array.from({ length: xLabels.length }, () => 0))
  const flightCounts = yLabels.map(() => Array.from({ length: xLabels.length }, () => null))

  points.forEach((point) => {
    const xLabel = point?.x ?? 'Unknown'
    const yLabel = point?.y ?? 'Unknown'
    const xPosition = xIndex.get(xLabel)
    const yPosition = yIndex.get(yLabel)

    if (xPosition !== undefined && yPosition !== undefined) {
      z[yPosition][xPosition] = getPointValue(point?.value)
      flightCounts[yPosition][xPosition] = getPointFlightCount(point)
    }
  })

  return { xLabels, yLabels, z, flightCounts }
}

const buildActiveFilterChips = (filters) => {
  const chips = [
    ...filters.airlines.map((value) => ({ key: `airline-${value}`, label: `Airline: ${value}` })),
    ...filters.airports.map((value) => ({ key: `airport-${value}`, label: `Airport: ${value}` })),
    ...filters.delay_types.map((value) => ({
      key: `delay-${value}`,
      label: `Delay Type: ${value}`,
    })),
  ]

  chips.push({ key: 'metric', label: `Metric: ${filters.metric}` })
  chips.push({ key: 'table-view', label: `Table View: ${filters.table_view}` })

  return chips
}

const SUMMARY_TABLE_COLUMNS = [
  { key: 'carrier_name', label: 'Carrier Name' },
  { key: 'avg_arr_delay', label: 'Average Arrival Delay (min)' },
  { key: 'total_flights', label: 'Total Flights (count)' },
]

const RAW_FLIGHTS_TABLE_COLUMNS = [
  { key: 'flight_id', label: 'Flight ID' },
  { key: 'full_date', label: 'Date' },
  { key: 'carrier_name', label: 'Carrier' },
  { key: 'origin_airport', label: 'Origin' },
  { key: 'destination_airport', label: 'Destination' },
  { key: 'arr_delay', label: 'Arrival Delay (min)' },
  { key: 'dep_delay', label: 'Departure Delay (min)' },
  { key: 'distance', label: 'Distance (miles)' },
  { key: 'air_time', label: 'Air Time (min)' },
]

const HeatmapPanel = React.memo(({ heatmapData, heatmapMatrix, metric }) => {
  const metricDisplay = getMetricDisplay(metric)
  const tooltipExtraMatrix =
    heatmapMatrix?.flightCounts?.map((row) =>
      row.map((count) => (count === null ? '' : `<br>Flight Count: ${count} (count)`)),
    ) || []

  return (
    <CCard className="shadow-sm">
      <CCardHeader>
        <strong>Heatmap Preview</strong>
      </CCardHeader>
      <CCardBody
        className="d-flex align-items-center justify-content-center"
        style={{ minHeight: '320px' }}
      >
        <div className="w-100">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="h6 mb-0">Matrix Heatmap Preview</h3>
            <CBadge color="secondary">
              Heatmap data points: {Array.isArray(heatmapData) ? heatmapData.length : 0}
            </CBadge>
          </div>
          {heatmapMatrix ? (
            <Plot
              data={[
                {
                  type: 'heatmap',
                  x: heatmapMatrix.xLabels,
                  y: heatmapMatrix.yLabels,
                  z: heatmapMatrix.z,
                  text: tooltipExtraMatrix,
                  colorscale: 'Viridis',
                  hoverongaps: false,
                  zsmooth: false,
                  hovertemplate: `Airport (IATA): %{x}<br>Delay Type: %{y}<br>${metricDisplay.valueLabel}: %{z} ${metricDisplay.valueUnit}%{text}<extra></extra>`,
                  colorbar: {
                    title: metricDisplay.colorbarTitle,
                  },
                },
              ]}
              layout={{
                autosize: true,
                margin: { l: 100, r: 20, t: 20, b: 80 },
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                font: { color: '#e4e7ea' },
                xaxis: {
                  title: { text: 'Airport (IATA)', font: { color: '#e4e7ea' } },
                  tickfont: { color: '#e4e7ea' },
                  automargin: true,
                  type: 'category',
                },
                yaxis: {
                  title: { text: 'Delay Type', font: { color: '#e4e7ea' } },
                  tickfont: { color: '#e4e7ea' },
                  automargin: true,
                  type: 'category',
                },
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: '420px' }}
              useResizeHandler
            />
          ) : (
            <div
              className="rounded border border-2 text-center p-5 w-100 text-medium-emphasis"
              style={{ borderStyle: 'dashed', minHeight: '320px' }}
            >
              {Array.isArray(heatmapData) && heatmapData.length === 0
                ? 'No heatmap data returned for the selected filters.'
                : 'Run a query to render the heatmap.'}
            </div>
          )}
        </div>
      </CCardBody>
    </CCard>
  )
})

const HeatmapPage = () => {
  const { filters, queryMode } = useFilters()
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasQueried, setHasQueried] = useState(false)
  const [querySucceeded, setQuerySucceeded] = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [summary, setSummary] = useState(null)
  const heatmapMatrix = useMemo(() => buildHeatmapMatrix(heatmapData), [heatmapData])
  const activeFilterChips = useMemo(() => buildActiveFilterChips(filters), [filters])
  const activeTableView = summary?.table_view || filters.table_view
  const tableColumns =
    activeTableView === 'raw_flights' ? RAW_FLIGHTS_TABLE_COLUMNS : SUMMARY_TABLE_COLUMNS

  const buildRequestPayload = useCallback(
    () => ({
      airlines: filters.airlines,
      airports: filters.airports,
      delay_types: filters.delay_types,
      metric: filters.metric,
      table_view: filters.table_view,
    }),
    [filters],
  )

  const runQuery = useCallback(async () => {
    setIsLoading(true)
    setError('')
    setSummary(null)
    setHasQueried(true)
    setQuerySucceeded(false)

    try {
      const response = await fetch(`${API_BASE_URL}/analysis/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildRequestPayload()),
      })

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`

        try {
          const errorPayload = await response.json()
          if (errorPayload?.detail) {
            errorMessage = formatErrorDetail(errorPayload.detail)
          }
        } catch (parseError) {
          void parseError
        }

        throw new Error(errorMessage)
      }

      const payload = await response.json()
      setRows(Array.isArray(payload?.table_data) ? payload.table_data : [])
      setSummary(payload?.summary || null)
      setHeatmapData(payload?.heatmap_data ?? null)
      setError('')
      setQuerySucceeded(true)
    } catch (queryError) {
      setRows([])
      setSummary(null)
      setHeatmapData(null)
      setQuerySucceeded(false)
      setError(queryError instanceof Error ? queryError.message : 'Unable to load results.')
    } finally {
      setIsLoading(false)
    }
  }, [buildRequestPayload])

  useEffect(() => {
    if (queryMode !== 'auto') {
      return
    }

    const timeoutId = setTimeout(() => {
      void runQuery()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [queryMode, runQuery])

  return (
    <div className="d-flex flex-column gap-4">
      <CCard className="shadow-sm">
        <CCardBody className="p-4">
          <h1 className="h3 mb-2">Flight Reliability Analysis</h1>
          <p className="text-medium-emphasis mb-4">
            Explore flight delay analytics with scalable, backend-powered filters.
          </p>
          <CButton color="primary" onClick={runQuery} disabled={isLoading}>
            {isLoading ? 'Loading...' : queryMode === 'auto' ? 'Refresh Now' : 'Run Query'}
          </CButton>
          <span className="small text-medium-emphasis ms-3">
            Mode: {queryMode === 'auto' ? 'Auto (debounced)' : 'Manual'}
          </span>

          <div className="mt-4">
            <h2 className="h5 mb-3">Results</h2>
            {error ? <CAlert color="danger">{error}</CAlert> : null}

            <CCard className="mb-3 border">
              <CCardBody className="py-3">
                <h3 className="h6 mb-2">Active Filters</h3>
                {activeFilterChips.length > 0 ? (
                  <div className="d-flex flex-wrap gap-2">
                    {activeFilterChips.map((chip) => (
                      <CBadge key={chip.key} color="light" className="border text-dark">
                        {chip.label}
                      </CBadge>
                    ))}
                  </div>
                ) : (
                  <div className="small text-medium-emphasis">No active filters selected.</div>
                )}
              </CCardBody>
            </CCard>

            <CRow className="g-3 mb-3">
              <CCol md={3}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Metric</div>
                    <div className="fw-semibold">{displayValue(summary?.metric)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
              <CCol md={3}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Table View</div>
                    <div className="fw-semibold">{displayValue(summary?.table_view)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
              <CCol md={3}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Total Results</div>
                    <div className="fw-semibold">{displayValue(summary?.row_count)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
              <CCol md={3}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Heatmap Points</div>
                    <div className="fw-semibold">{displayValue(summary?.heatmap_point_count)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
            </CRow>

            <div
              className="table-scroll-container mb-0"
              style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'hidden' }}
            >
              <CTable bordered hover responsive className="mb-0 align-middle">
                <CTableHead color="light">
                  <CTableRow>
                    {tableColumns.map((column) => (
                      <CTableHeaderCell key={column.key} scope="col">
                        {column.label}
                      </CTableHeaderCell>
                    ))}
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {isLoading ? (
                    <CTableRow>
                      <CTableDataCell colSpan={tableColumns.length} className="text-center py-4">
                        <CSpinner size="sm" className="me-2" /> Loading results...
                      </CTableDataCell>
                    </CTableRow>
                  ) : rows.length > 0 ? (
                    rows.map((row, index) => (
                      <CTableRow key={`${row.flight_id || row.carrier_name || 'row'}-${index}`}>
                        {tableColumns.map((column) => (
                          <CTableDataCell key={`${column.key}-${index}`}>
                            {displayValue(row[column.key])}
                          </CTableDataCell>
                        ))}
                      </CTableRow>
                    ))
                  ) : !hasQueried ? (
                    <CTableRow>
                      <CTableDataCell
                        colSpan={tableColumns.length}
                        className="text-center text-medium-emphasis py-4"
                      >
                        {queryMode === 'auto'
                          ? 'Waiting for filter updates to trigger the first query.'
                          : 'Click Run Query to load results.'}
                      </CTableDataCell>
                    </CTableRow>
                  ) : querySucceeded ? (
                    <CTableRow>
                      <CTableDataCell
                        colSpan={tableColumns.length}
                        className="text-center text-medium-emphasis py-4"
                      >
                        No results returned.
                      </CTableDataCell>
                    </CTableRow>
                  ) : null}
                </CTableBody>
              </CTable>
            </div>
          </div>
        </CCardBody>
      </CCard>

      <HeatmapPanel
        heatmapData={heatmapData}
        heatmapMatrix={heatmapMatrix}
        metric={summary?.metric || filters.metric}
      />
      <div className="small text-medium-emphasis px-1">
        Heatmap axes follow selected filters: chosen airports limit visible columns and chosen delay
        types limit visible rows.
      </div>
    </div>
  )
}

export default HeatmapPage
