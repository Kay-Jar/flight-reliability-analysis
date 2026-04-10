/**
 * AppSidebar Component
 *
 * Collapsible navigation sidebar with branding, menu items, and toggle controls.
 *
 * Features:
 * - Redux-controlled visibility state
 * - Unfoldable/narrow mode for more screen space
 * - Brand logo with full and narrow variants
 * - Close button for mobile devices
 * - Footer with toggle button
 * - Dark color scheme
 * - Fixed positioning
 *
 * @component
 * @example
 * return (
 *   <AppSidebar />
 * )
 */

import React from 'react'
import { useSelector, useDispatch } from 'react-redux'

import {
  CCloseButton,
  CForm,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
} from '@coreui/react'

import { useFilters } from '../context/FiltersContext'
import teamBlueLogo from '../assets/images/TeamBlueLogoCropped.png'

const airlineOptions = [
  'Delta Air Lines Inc.',
  'United Air Lines Inc.',
  'Southwest Airlines Co.',
  'American Airlines Inc.',
  'JetBlue Airways',
]
const airportOptions = ['ATL', 'ORD', 'DEN', 'LAX', 'JFK']
const delayTypeOptions = ['Weather', 'Aircraft', 'Carrier', 'NAS', 'Security']

const toggleValue = (values, value) => {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

/**
 * AppSidebar functional component
 *
 * Manages sidebar state with Redux:
 * - sidebarShow: Controls sidebar visibility
 * - sidebarUnfoldable: Controls narrow/wide mode
 *
 * Renders navigation from _nav.js configuration file.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns {React.ReactElement} Sidebar with navigation
 */
const AppSidebar = () => {
  const dispatch = useDispatch()
  const unfoldable = useSelector((state) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state) => state.sidebarShow)
  const { filters, setFilters } = useFilters()

  const updateFilters = (updates) => {
    setFilters((currentFilters) => ({
      ...currentFilters,
      ...updates,
    }))
  }

  return (
    <CSidebar
      className="border-end"
      colorScheme="dark"
      position="fixed"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <CSidebarHeader className="border-bottom py-1">
        <CSidebarBrand to="/" className="justify-content-center align-items-center px-0 py-0">
          <img
            src={teamBlueLogo}
            alt="Team Blue"
            style={{ maxHeight: '48px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </CSidebarBrand>
        <CCloseButton
          className="d-lg-none"
          dark
          onClick={() => dispatch({ type: 'set', sidebarShow: false })}
        />
      </CSidebarHeader>
      <CSidebarNav className="px-3 py-3">
        <CForm>
          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Airlines</CFormLabel>
            {airlineOptions.map((airline) => (
              <CFormCheck
                key={airline}
                id={`airline-${airline.toLowerCase()}`}
                label={airline}
                checked={filters.airlines.includes(airline)}
                onChange={() =>
                  updateFilters({
                    airlines: toggleValue(filters.airlines, airline),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Airports</CFormLabel>
            {airportOptions.map((airport) => (
              <CFormCheck
                key={airport}
                id={`airport-${airport.toLowerCase()}`}
                label={airport}
                checked={filters.airports.includes(airport)}
                onChange={() =>
                  updateFilters({
                    airports: toggleValue(filters.airports, airport),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Delay Types</CFormLabel>
            {delayTypeOptions.map((delayType) => (
              <CFormCheck
                key={delayType}
                id={`delay-${delayType.toLowerCase()}`}
                label={delayType}
                checked={filters.delay_types.includes(delayType)}
                onChange={() =>
                  updateFilters({
                    delay_types: toggleValue(filters.delay_types, delayType),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-2">
            <CFormLabel className="fw-semibold mb-2">Date Range</CFormLabel>
            <CFormInput
              size="sm"
              type="date"
              value={filters.start_date}
              onChange={(event) => updateFilters({ start_date: event.target.value })}
            />
            <CFormInput
              size="sm"
              type="date"
              value={filters.end_date}
              onChange={(event) => updateFilters({ end_date: event.target.value })}
              className="mt-2"
            />
          </div>
        </CForm>
      </CSidebarNav>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
