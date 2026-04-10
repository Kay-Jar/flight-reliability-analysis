import React, { useState } from 'react'
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

import { useFilters } from '../../context/FiltersContext'
import { API_BASE_URL } from '../../config/api'

const displayValue = (value) => (value === 0 ? '0' : value || '-')

const formatList = (items) => (items.length > 0 ? items.join(', ') : 'Any')

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

const HeatmapPage = () => {
  const { filters } = useFilters()
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasQueried, setHasQueried] = useState(false)
  const [querySucceeded, setQuerySucceeded] = useState(false)
  const [heatmapData, setHeatmapData] = useState(null)
  const [summary, setSummary] = useState(null)

  const buildRequestPayload = () => ({
    airlines: filters.airlines,
    airports: filters.airports,
    delay_types: filters.delay_types,
    start_date: filters.start_date || null,
    end_date: filters.end_date || null,
    metric: filters.metric,
    view: filters.view,
  })

  const runQuery = async () => {
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
  }

  return (
    <div className="d-flex flex-column gap-4">
      <CCard className="shadow-sm">
        <CCardBody className="p-4">
          <h1 className="h3 mb-2">Flight Reliability Analysis</h1>
          <p className="text-medium-emphasis mb-4">
            A checkpoint demo for exploring flight delay analytics before the final heatmap view.
          </p>
          <CButton color="primary" onClick={runQuery} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Run Query'}
          </CButton>

          <div className="mt-4">
            <h2 className="h5 mb-3">Results</h2>
            {error ? <CAlert color="danger">{error}</CAlert> : null}

            <CCard className="mb-3 border">
              <CCardBody className="py-3">
                <h3 className="h6 mb-2">Active Filters</h3>
                <div className="small mb-1">
                  <strong>Airlines:</strong> {formatList(filters.airlines)}
                </div>
                <div className="small mb-1">
                  <strong>Airports:</strong> {formatList(filters.airports)}
                </div>
                <div className="small mb-1">
                  <strong>Delay Types:</strong> {formatList(filters.delay_types)}
                </div>
                <div className="small">
                  <strong>Date Range:</strong>{' '}
                  {filters.start_date || filters.end_date
                    ? `${filters.start_date || 'Any'} to ${filters.end_date || 'Any'}`
                    : 'Any'}
                </div>
              </CCardBody>
            </CCard>

            <CRow className="g-3 mb-3">
              <CCol md={4}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Metric</div>
                    <div className="fw-semibold">{displayValue(summary?.metric)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
              <CCol md={4}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">View</div>
                    <div className="fw-semibold">{displayValue(summary?.view)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
              <CCol md={4}>
                <CCard className="h-100 border">
                  <CCardBody className="py-3">
                    <div className="small text-medium-emphasis">Rows Returned</div>
                    <div className="fw-semibold">{displayValue(summary?.row_count)}</div>
                  </CCardBody>
                </CCard>
              </CCol>
            </CRow>

            <CTable bordered hover responsive className="mb-0 align-middle">
              <CTableHead color="light">
                <CTableRow>
                  <CTableHeaderCell scope="col">Carrier Name</CTableHeaderCell>
                  <CTableHeaderCell scope="col">Average Arrival Delay</CTableHeaderCell>
                  <CTableHeaderCell scope="col">Total Flights</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {isLoading ? (
                  <CTableRow>
                    <CTableDataCell colSpan={3} className="text-center py-4">
                      <CSpinner size="sm" className="me-2" /> Loading results...
                    </CTableDataCell>
                  </CTableRow>
                ) : rows.length > 0 ? (
                  rows.map((row, index) => (
                    <CTableRow key={`${row.carrier_name || 'carrier'}-${index}`}>
                      <CTableDataCell>{displayValue(row.carrier_name)}</CTableDataCell>
                      <CTableDataCell>{displayValue(row.avg_arr_delay)}</CTableDataCell>
                      <CTableDataCell>{displayValue(row.total_flights)}</CTableDataCell>
                    </CTableRow>
                  ))
                ) : !hasQueried ? (
                  <CTableRow>
                    <CTableDataCell colSpan={3} className="text-center text-medium-emphasis py-4">
                      Click Run Query to load checkpoint results.
                    </CTableDataCell>
                  </CTableRow>
                ) : querySucceeded ? (
                  <CTableRow>
                    <CTableDataCell colSpan={3} className="text-center text-medium-emphasis py-4">
                      No results returned.
                    </CTableDataCell>
                  </CTableRow>
                ) : null}
              </CTableBody>
            </CTable>
          </div>
        </CCardBody>
      </CCard>

      <CCard className="shadow-sm">
        <CCardHeader>
          <strong>Heatmap Preview</strong>
        </CCardHeader>
        <CCardBody className="d-flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
          <div
            className="rounded border border-2 text-center p-5 w-100 text-medium-emphasis"
            style={{ borderStyle: 'dashed' }}
          >
            Heatmap will render here later.
            <div className="mt-3">
              <CBadge color="secondary">
                Heatmap data points: {Array.isArray(heatmapData) ? heatmapData.length : 0}
              </CBadge>
            </div>
            {heatmapData ? null : null}
          </div>
        </CCardBody>
      </CCard>
    </div>
  )
}

export default HeatmapPage
