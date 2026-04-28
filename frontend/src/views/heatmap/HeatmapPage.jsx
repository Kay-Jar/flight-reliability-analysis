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
    ...filters.op_airlines.map((value) => ({
      key: `op-airline-${value}`,
      label: `Operating Airline: ${value}`,
    })),
    ...filters.airports.map((value) => ({ key: `airport-${value}`, label: `Airport: ${value}` })),
    ...filters.delay_types.map((value) => ({
      key: `delay-${value}`,
      label: `Delay Type: ${value}`,
    })),
    ...filters.tiers.map((value) => ({ key: `tier-${value}`, label: `Tier: ${value}` })),
  ]

  chips.push({ key: 'metric', label: `Metric: ${filters.metric}` })
  chips.push({ key: 'table-view', label: `Table View: ${filters.table_view}` })

  return chips
}

const TIER_BADGE_COLOR = {
  Excellent: 'success',
  Good: 'info',
  Average: 'warning',
  Poor: 'danger',
}

const SUMMARY_TABLE_COLUMNS = [
  { key: 'carrier_name', label: 'Carrier Name' },
  { key: 'avg_arr_delay', label: 'Average Arrival Delay (min)' },
  { key: 'total_flights', label: 'Total Flights (count)' },
  { key: 'tier', label: 'Tier' },
]

const ROW_DISPLAY_LIMIT = 100

const RAW_FLIGHTS_TABLE_COLUMNS = [
  { key: 'flight_id', label: 'Flight ID' },
  { key: 'full_date', label: 'Date' },
  { key: 'carrier_name', label: 'Marketing Carrier' },
  { key: 'op_carrier_name', label: 'Operating Carrier' },
  { key: 'branded_code_share', label: 'Brand' },
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
  const [showAllRows, setShowAllRows] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasQueried, setHasQueried] = useState(false)
  const [querySucceeded, setQuerySucceeded] = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [worstCarriers, setWorstCarriers] = useState([])
  const worstCarrierNames = useMemo(
    () => new Set(worstCarriers.map((c) => c.carrier_name)),
    [worstCarriers],
  )
  const [carrierTiers, setCarrierTiers] = useState([])
  const carrierTierMap = useMemo(() => {
    const map = new Map()
    carrierTiers.forEach((entry) => {
      if (entry?.carrier_name) {
        map.set(entry.carrier_name, entry.tier)
      }
    })
    return map
  }, [carrierTiers])
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const heatmapMatrix = useMemo(() => buildHeatmapMatrix(heatmapData), [heatmapData])
  const activeFilterChips = useMemo(() => buildActiveFilterChips(filters), [filters])
  const activeTableView = summary?.table_view || filters.table_view
  const tableColumns =
    activeTableView === 'raw_flights' ? RAW_FLIGHTS_TABLE_COLUMNS : SUMMARY_TABLE_COLUMNS

  const buildRequestPayload = useCallback(
    () => ({
      airlines: filters.airlines,
      op_airlines: filters.op_airlines,
      airports: filters.airports,
      delay_types: filters.delay_types,
      tiers: filters.tiers,
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
    setShowAllRows(false)

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

    // Refresh the fleet-wide "worst carriers" reference set used to annotate the
    // Carrier Summary table. Fleet-level by design (the SP compares to the global avg),
    // so it doesn't take filters and never blocks the main query path.
    try {
      const spResponse = await fetch(
        `${API_BASE_URL}/analysis/carriers-above-average?min_flights=100&limit=15`,
      )
      if (spResponse.ok) {
        setWorstCarriers(await spResponse.json())
      } else {
        setWorstCarriers([])
      }
    } catch {
      setWorstCarriers([])
    }

    // Fleet-wide tier classification (sp_classify_carrier_delay_tiers) — drives
    // the Tier column in the carrier summary table.
    try {
      const tierResponse = await fetch(`${API_BASE_URL}/analysis/carrier-tiers`)
      if (tierResponse.ok) {
        setCarrierTiers(await tierResponse.json())
      } else {
        setCarrierTiers([])
      }
    } catch {
      setCarrierTiers([])
    }
  }, [buildRequestPayload])

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/analysis/dashboard?limit_airports=15&limit_routes=10`,
      )
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      setDashboard(await response.json())
    } catch (err) {
      setDashboard(null)
      setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard.')
    } finally {
      setDashboardLoading(false)
    }
  }, [])

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

            {activeTableView === 'carrier_summary' && worstCarrierNames.size > 0 ? (
              <div className="small text-medium-emphasis mb-2">
                Highlighted rows have an average arrival delay worse than the global
                all-flights average.
              </div>
            ) : null}

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
                    <>
                      {(showAllRows ? rows : rows.slice(0, ROW_DISPLAY_LIMIT)).map((row, index) => {
                        const isWorst =
                          activeTableView === 'carrier_summary' &&
                          worstCarrierNames.has(row.carrier_name)
                        const rowTier =
                          activeTableView === 'carrier_summary'
                            ? carrierTierMap.get(row.carrier_name)
                            : undefined
                        return (
                          <CTableRow
                            key={`${row.flight_id || row.carrier_name || 'row'}-${index}`}
                            color={isWorst ? 'warning' : undefined}
                          >
                            {tableColumns.map((column) => (
                              <CTableDataCell key={`${column.key}-${index}`}>
                                {column.key === 'tier' ? (
                                  rowTier ? (
                                    <CBadge color={TIER_BADGE_COLOR[rowTier] || 'secondary'}>
                                      {rowTier}
                                    </CBadge>
                                  ) : (
                                    <span className="text-medium-emphasis">-</span>
                                  )
                                ) : (
                                  displayValue(row[column.key])
                                )}
                              </CTableDataCell>
                            ))}
                          </CTableRow>
                        )
                      })}
                      {!showAllRows && rows.length > ROW_DISPLAY_LIMIT ? (
                        <CTableRow>
                          <CTableDataCell
                            colSpan={tableColumns.length}
                            className="text-center text-medium-emphasis py-3"
                          >
                            Showing {ROW_DISPLAY_LIMIT} of {rows.length}.{' '}
                            <CButton
                              size="sm"
                              color="link"
                              className="p-0 align-baseline"
                              onClick={() => setShowAllRows(true)}
                            >
                              Show all ({rows.length - ROW_DISPLAY_LIMIT} more rows)
                            </CButton>
                          </CTableDataCell>
                        </CTableRow>
                      ) : null}
                    </>
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

      <CCard className="shadow-sm">
        <CCardHeader>
          <strong>Network Hotspots</strong>
        </CCardHeader>
        <CCardBody>
          <CButton color="primary" onClick={loadDashboard} disabled={dashboardLoading}>
            {dashboardLoading ? 'Loading...' : 'Load Snapshot'}
          </CButton>
          {dashboardError ? (
            <CAlert color="danger" className="mt-3 mb-0">
              {dashboardError}
            </CAlert>
          ) : null}
          {dashboard ? (
            <CRow className="g-3 mt-2">
              <CCol md={6}>
                <h3 className="h6 mb-2">Busiest Airports</h3>
                <CTable bordered hover responsive small className="mb-0 align-middle">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Airport</CTableHeaderCell>
                      <CTableHeaderCell>Role</CTableHeaderCell>
                      <CTableHeaderCell>Flights</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {dashboard.busiest_airports.map((row, idx) => (
                      <CTableRow key={`${row.airport}-${row.role}-${idx}`}>
                        <CTableDataCell>{row.airport}</CTableDataCell>
                        <CTableDataCell>{row.role}</CTableDataCell>
                        <CTableDataCell>{row.flight_count}</CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </CCol>
              <CCol md={6}>
                <h3 className="h6 mb-2">Top Routes by Delay Type</h3>
                <CTable bordered hover responsive small className="mb-0 align-middle">
                  <CTableHead color="light">
                    <CTableRow>
                      <CTableHeaderCell>Route</CTableHeaderCell>
                      <CTableHeaderCell>Delay Type</CTableHeaderCell>
                      <CTableHeaderCell>Total Delay (min)</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {dashboard.top_routes_by_delay.map((row, idx) => (
                      <CTableRow key={`${row.origin_code}-${row.dest_code}-${row.delay_type_name}-${idx}`}>
                        <CTableDataCell>{row.origin_code} → {row.dest_code}</CTableDataCell>
                        <CTableDataCell>{row.delay_type_name}</CTableDataCell>
                        <CTableDataCell>{row.total_delay_minutes}</CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </CCol>
            </CRow>
          ) : null}
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
