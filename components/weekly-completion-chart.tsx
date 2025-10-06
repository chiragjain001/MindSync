"use client"

import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { useEnhancedWeeklyData, EnhancedWeeklyDayData } from "@/hooks/useEnhancedWeeklyData"

interface TooltipData {
  show: boolean
  x: number
  y: number
  data: EnhancedWeeklyDayData | null
}

export function WeeklyCompletionChart() {
  const { weekData, loading, error } = useEnhancedWeeklyData()
  const [tooltip, setTooltip] = useState<TooltipData>({ show: false, x: 0, y: 0, data: null })
  const [animationComplete, setAnimationComplete] = useState(false)

  // Get bar color based on completion percentage and day type
  const getBarColor = (percentage: number, isFuture: boolean, isCurrentDay: boolean) => {
    if (isFuture) return '#6b7280' // Gray for future days
    
    // Current day gets bright highlight regardless of completion
    if (isCurrentDay) {
      return 'linear-gradient(to top, #fb923c, #fbbf24)' // Orange to yellow gradient for current day
    }
    
    // Past days based on completion percentage
    if (percentage <= 20) return '#6b7280' // Gray
    if (percentage <= 40) return '#60a5fa' // Light blue
    if (percentage <= 60) return '#3b82f6' // Blue
    if (percentage <= 80) return 'linear-gradient(to top, #f472b6, #ec4899)' // Pink/Red gradient
    return 'linear-gradient(to top, #fb923c, #fbbf24)' // Orange to yellow gradient
  }

  // Get bar height - properly scale with Y-axis percentages
  const getBarHeight = (percentage: number, isFuture: boolean, isCurrentDay: boolean) => {
    if (isFuture) return 30; // Future tubes at 30% height (inactive)
    
    // Scale the height based on actual completion percentage
    // Ensure minimum visibility and proper scaling to Y-axis
    const scaledHeight = Math.max(5, percentage); // Minimum 5% for visibility
    
    if (isCurrentDay) {
      // Current day gets a slight boost for visibility but respects the percentage
      return Math.min(100, scaledHeight + 5);
    }
    
    return scaledHeight; // Height matches actual completion percentage
  }

  // Handle bar hover
  const handleBarHover = (event: React.MouseEvent, dayData: EnhancedWeeklyDayData) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      show: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      data: dayData
    })
  }

  // Handle mouse leave
  const handleMouseLeave = () => {
    setTooltip({ show: false, x: 0, y: 0, data: null })
  }

  // Trigger animation on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationComplete(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])


  return (
    <>
      <Card className="rounded-3xl p-6 bg-white border-gray-200 shadow-sm relative">
        {/* Coming Soon Overlay */}
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-3xl flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800 mb-2">Coming Soon</div>
            <div className="text-sm text-gray-600">Weekly completion tracking</div>
          </div>
        </div>
        
        <div className="mb-6 lg:mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Weekly Completion Rate</h3>
        </div>
        
        <div className="relative h-48 sm:h-56 lg:h-64 flex flex-col">
          {/* Chart area with Y-axis */}
          <div className="flex-1 flex">
            {/* Y-axis with percentage labels */}
            <div className="flex flex-col justify-between h-full w-10 pr-2 text-xs text-gray-500">
              <span>100%</span>
              <span>80%</span>
              <span>60%</span>
              <span>40%</span>
              <span>20%</span>
              <span>0%</span>
            </div>
            
            {/* Tubes container */}
            <div className="flex-1 relative h-full flex items-end justify-between gap-2 sm:gap-3 px-1 sm:px-2">
              {weekData.map((day, index) => {
                const barHeight = getBarHeight(day.completionPercentage, day.isFutureDay, day.isCurrentDay)
                const barColor = getBarColor(day.completionPercentage, day.isFutureDay, day.isCurrentDay)
                const isGradient = typeof barColor === 'string' && barColor.includes('gradient')
                
                return (
                  <div key={day.date.toISOString()} className="flex flex-col items-center flex-1">
                    {/* Vertical Tube Bar */}
                    <div
                      className={`relative w-full max-w-[12px] sm:max-w-[14px] rounded-full cursor-pointer transition-all duration-300 hover:scale-105 overflow-hidden ${
                        day.isCurrentDay ? 'shadow-lg' : ''
                      }`}
                      style={{
                        height: `${barHeight}%`,
                        backgroundColor: day.isFutureDay ? '#9ca3af' : '#374151',
                        transform: animationComplete ? 'translateY(0)' : 'translateY(100%)',
                        transition: `all 0.8s ease-out ${index * 0.1}s`,
                        opacity: animationComplete ? 1 : 0,
                        minHeight: day.isFutureDay ? '20px' : '8px', // Minimal height for visibility
                        maxHeight: '100%',
                        boxShadow: day.isCurrentDay ? '0 0 25px rgba(251, 146, 60, 0.6)' : 'none',
                        border: 'none'
                      }}
                      onMouseEnter={(e) => handleBarHover(e, day)}
                      onMouseLeave={handleMouseLeave}
                      role="button"
                      tabIndex={0}
                      aria-label={`${day.dayName}: ${day.completedTasks} of ${day.totalTasks} tasks completed (${day.completionPercentage}%)`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleBarHover(e as any, day)
                        }
                      }}
                    >
                      {/* Liquid Fill - Only for past and current days */}
                      {!day.isFutureDay && (
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-1000 ease-out"
                          style={{
                            height: `${day.completionPercentage}%`,
                            background: isGradient ? barColor : barColor,
                            transform: animationComplete ? 'translateY(0)' : 'translateY(100%)',
                            transition: `all 1.2s ease-out ${index * 0.1 + 0.3}s`,
                            opacity: animationComplete ? 1 : 0,
                            filter: day.isCurrentDay ? 'brightness(1.2) saturate(1.3)' : 'brightness(1.1)'
                          }}
                        >
                          {/* Liquid Wave Effect */}
                          <div
                            className="absolute top-0 left-0 right-0 h-2 opacity-40"
                            style={{
                              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                              animation: animationComplete && !day.isFutureDay ? 'wave 2s ease-in-out infinite' : 'none'
                            }}
                          />
                          
                          {/* Current Day Glow Effect */}
                          {day.isCurrentDay && (
                            <div
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(to top, rgba(251, 146, 60, 0.3), rgba(251, 191, 36, 0.3))',
                                animation: 'pulse 2s ease-in-out infinite'
                              }}
                            />
                          )}
                        </div>
                      )}
                      
                      {/* Empty Tube Effect for Future Days */}
                      {day.isFutureDay && (
                        <div
                          className="absolute inset-1 rounded-full"
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid #9ca3af',
                            opacity: 0.3
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          
          {/* Day labels below the chart */}
          <div className="flex justify-between items-center mt-3 px-1 sm:px-2">
            <div className="w-10"></div> {/* Spacer for Y-axis */}
            <div className="flex-1 flex justify-between gap-2 sm:gap-3 px-1 sm:px-2">
              {weekData.map((day) => (
                <div key={`label-${day.date.toISOString()}`} className="flex-1 text-center">
                  <div className={`text-xs sm:text-sm font-medium ${
                    day.isCurrentDay ? 'text-gray-900 font-bold' : day.isFutureDay ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {day.dayShort}
                  </div>
                  {day.isCurrentDay && (
                    <div className="w-1 h-1 bg-orange-500 rounded-full mx-auto mt-1"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tooltip */}
      {tooltip.show && tooltip.data && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg border border-gray-700 text-sm animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="font-medium">{tooltip.data.dayName}</div>
            <div className="text-gray-300">
              Tasks: {tooltip.data.completedTasks}/{tooltip.data.totalTasks}
            </div>
            <div className="text-gray-300">
              Habits: {tooltip.data.completedHabits}/{tooltip.data.totalHabits}
            </div>
            <div className="text-gray-300">
              Wellness: {tooltip.data.completedWellness}/{tooltip.data.totalWellness}
            </div>
            <div className="font-medium text-blue-400">
              {tooltip.data.completionPercentage}% completed
            </div>
          </div>
        </div>
      )}
    </>
  )
}
