import React, { useState } from 'react'
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react'

const endpoint = 'http://127.0.0.1:8000/avg-arr-delay-by-carrier'

const displayValue = (value) => (value === 0 ? '0' : value || '-')

const parseResults = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  return []
}

const HeatmapPage = () => {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasQueried, setHasQueried] = useState(false)
  const [querySucceeded, setQuerySucceeded] = useState(false)

  const runQuery = async () => {
    setIsLoading(true)
    setError('')
    setHasQueried(true)
    setQuerySucceeded(false)

    try {
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      const payload = await response.json()
      const results = parseResults(payload)
      setRows(results)
      setError('')
      setQuerySucceeded(true)
    } catch (queryError) {
      setRows([])
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
          </div>
        </CCardBody>
      </CCard>
    </div>
  )
}

export default HeatmapPage
