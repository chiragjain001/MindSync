import { useState, useEffect, useMemo } from 'react';
import { useSupabaseTasks } from './useSupabaseTasks';
import { useSupabaseHabits } from './useSupabaseHabits';
import { useSupabaseWellness } from './useSupabaseWellness';

interface CompletionStats {
  totalItems: number;
  completedItems: number;
  completionPercentage: number;
  breakdown: {
    tasks: {
      total: number;
      completed: number;
      percentage: number;
    };
    habits: {
      total: number;
      completed: number;
      percentage: number;
    };
    wellness: {
      total: number;
      completed: number;
      percentage: number;
    };
  };
}

export function useUnifiedCompletion() {
  const { tasks, loading: tasksLoading } = useSupabaseTasks();
  const { habits, loading: habitsLoading } = useSupabaseHabits();
  const { wellness, completionPercentage: wellnessCompletionPercentage = 0, loading: wellnessLoading } = useSupabaseWellness();

  const [realTimeUpdate, setRealTimeUpdate] = useState(0);

  // Force real-time updates when any data changes
  useEffect(() => {
    setRealTimeUpdate(prev => prev + 1);
  }, [tasks, habits, wellness]);

  const completionStats: CompletionStats = useMemo(() => {
    // Filter today's items only
    const today = new Date().toISOString().split('T')[0];
    
    // Tasks: Filter today's tasks or all tasks (depending on your preference)
    const todaysTasks = tasks?.filter(task => {
      if (!task.createdAt) return true; // Include tasks without date
      const taskDate = new Date(task.createdAt).toISOString().split('T')[0];
      return taskDate === today;
    }) || [];

    // Habits: All habits (daily tracking)
    const todaysHabits = habits || [];

    // Wellness: Today's wellness activities
    const todaysWellness = wellness || [];

    // Calculate completions
    const completedTasks = todaysTasks.filter(task => task.completed).length;
    const completedHabits = todaysHabits.filter(habit => habit.completedToday).length;
    const completedWellness = todaysWellness.filter(activity => activity.completed).length;

    // Calculate totals - for wellness, target is 4 out of 6 for 100%
    const totalTasks = todaysTasks.length;
    const totalHabits = todaysHabits.length;
    const totalWellness = todaysWellness.length;
    const wellnessTarget = Math.min(4, totalWellness); // Target is 4, but can't be more than available

    // For overall calculation, treat wellness as if it has 4 items (the target)
    const effectiveWellnessTotal = wellnessTarget;
    const effectiveWellnessCompleted = Math.min(completedWellness, wellnessTarget);

    const totalItems = totalTasks + totalHabits + effectiveWellnessTotal;
    const completedItems = completedTasks + completedHabits + effectiveWellnessCompleted;

    // Calculate percentages
    const taskPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const habitPercentage = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;
    
    // Use the wellness completion percentage from the hook (4/6 = 100%)
    const wellnessPercentage = wellnessCompletionPercentage || 0;

    // Overall completion percentage with accelerated scaling
    let completionPercentage = 0;
    if (totalItems > 0) {
      const rawPercentage = (completedItems / totalItems) * 100;
      
      // Scale so that 90% completion shows as 100% in the bar
      if (rawPercentage >= 90) {
        completionPercentage = 100;
      } else {
        // Scale 0-90% to 0-100% for better user satisfaction
        completionPercentage = Math.round((rawPercentage / 90) * 100);
      }
    }

    return {
      totalItems,
      completedItems,
      completionPercentage,
      breakdown: {
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          percentage: taskPercentage
        },
        habits: {
          total: totalHabits,
          completed: completedHabits,
          percentage: habitPercentage
        },
        wellness: {
          total: wellnessTarget, // Show target of 4, not 6
          completed: effectiveWellnessCompleted, // Capped at target
          percentage: wellnessPercentage
        }
      }
    };
  }, [tasks, habits, wellness, wellnessCompletionPercentage, realTimeUpdate]);

  const loading = tasksLoading || habitsLoading || wellnessLoading;

  // Real-time logging function
  const logCompletionUpdate = (type: 'task' | 'habit' | 'wellness', action: 'completed' | 'uncompleted') => {
    console.log(`🔄 Real-time ${type} ${action}:`, {
      timestamp: new Date().toISOString(),
      completionPercentage: completionStats.completionPercentage,
      breakdown: completionStats.breakdown
    });
    
    // Trigger real-time update
    setRealTimeUpdate(prev => prev + 1);
  };

  return {
    ...completionStats,
    loading,
    logCompletionUpdate,
    // Helper functions
    isFullyCompleted: completionStats.completionPercentage >= 100,
    isOverAchieved: false, // No more overachievement, 100% is the max
    hasAnyItems: completionStats.totalItems > 0,
    // Individual completion status
    tasksCompleted: completionStats.breakdown.tasks.percentage === 100,
    habitsCompleted: completionStats.breakdown.habits.percentage === 100,
    wellnessCompleted: completionStats.breakdown.wellness.percentage === 100
  };
}
