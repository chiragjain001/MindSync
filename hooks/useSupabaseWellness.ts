import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { WellnessItem } from '@/store/use-mindmate-store';
import { useRouter } from 'next/navigation';
import wellnessTipsData from '@/lib/wellness-tips.json';

interface WellnessCompletion {
  id: string;
  user_id: string;
  activity_title: string;
  completion_date: string;
  created_at: string;
}

// Seeded shuffle for deterministic results
function seededShuffle(array: string[], seed: number): string[] {
  const shuffled = [...array];
  let currentSeed = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const j = Math.floor((currentSeed / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get 6 unique wellness tips for the current day
// SAME activities for ALL users on the same day - GENERATED DYNAMICALLY
function getDailyWellnessActivities(): WellnessItem[] {
  const today = new Date();
  
  // Use ONLY date for seed (no userId) so all users get same activities
  const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  
  // Get all tips and shuffle them
  const allTips = [...wellnessTipsData.wellnessTips];
  const tipStrings = allTips.map(t => t.tip);
  
  // Shuffle based on date only (same for all users)
  const shuffled = seededShuffle([...tipStrings], dateSeed);
  
  // Return first 6 activities as WellnessItem objects with unique IDs
  return shuffled.slice(0, 6).map((tip, index) => ({
    id: `wellness-${dateSeed}-${index}`, // Deterministic ID based on date and position
    title: tip,
    completed: false, // Will be updated based on completion data
    points: 10
  }));
}

// Calculate wellness completion percentage (4/6 = 100%)
function calculateWellnessCompletion(wellnessItems: WellnessItem[]): number {
  const completedCount = wellnessItems.filter(item => item.completed).length;
  const targetCount = 4; // 4 out of 6 = 100%
  const percentage = Math.min((completedCount / targetCount) * 100, 100);
  return Math.round(percentage);
}

export function useSupabaseWellness() {
  const [wellness, setWellness] = useState<WellnessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const router = useRouter();


  // Load wellness activities (generated dynamically + completion status from DB)
  const loadWellnessActivities = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        router.push('/auth');
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // 1. Generate today's 6 wellness activities dynamically (same for all users)
      const dailyActivities = getDailyWellnessActivities();

      // 2. Get completion status from database (user-specific)
      const { data: completions, error } = await supabase
        .from('wellness_completions')
        .select('*')
        .eq('user_id', user.id)
        .eq('completion_date', today);

      if (error) {
        throw error;
      }

      // 3. Merge generated activities with completion status
      const completedTitles = completions ? completions.map(c => c.activity_title) : [];
      const activitiesWithStatus = dailyActivities.map(activity => ({
        ...activity,
        completed: completedTitles.includes(activity.title)
      }));

      setWellness(activitiesWithStatus);
      
      // 4. Calculate completion percentage (4/6 = 100%)
      const completionPercent = calculateWellnessCompletion(activitiesWithStatus);
      setCompletionPercentage(completionPercent);
      
      setError(null);
    } catch (err) {
      console.error('Error loading wellness activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to load wellness activities');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Toggle wellness activity completion (only tracks completion, not activity itself)
  const toggleWellness = useCallback(async (id: string) => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      const activity = wellness.find(w => w.id === id);
      if (!activity) return;

      // Optimistic update for immediate UI feedback
      const updatedWellness = wellness.map(w => 
        w.id === id ? { ...w, completed: !w.completed } : w
      );
      setWellness(updatedWellness);
      
      // Update completion percentage immediately
      const newCompletionPercent = calculateWellnessCompletion(updatedWellness);
      setCompletionPercentage(newCompletionPercent);

      const today = new Date().toISOString().split('T')[0];

      try {
        if (!activity.completed) {
          // Mark as completed - ADD to wellness_completions table
          const { error: completionError } = await supabase
            .from('wellness_completions')
            .upsert({
              user_id: user.id,
              activity_title: activity.title,
              completion_date: today
            }, {
              onConflict: 'user_id,activity_title,completion_date'
            });

          if (completionError && !completionError.message.includes('duplicate')) {
            throw completionError;
          }
        } else {
          // Mark as incomplete - REMOVE from wellness_completions table
          const { error: deleteError } = await supabase
            .from('wellness_completions')
            .delete()
            .eq('user_id', user.id)
            .eq('activity_title', activity.title)
            .eq('completion_date', today);

          if (deleteError) {
            throw deleteError;
          }
        }
      } catch (dbError) {
        // Revert optimistic update on error
        const revertedWellness = wellness.map(w => 
          w.id === id ? { ...w, completed: activity.completed } : w
        );
        setWellness(revertedWellness);
        
        // Revert completion percentage
        const revertedCompletionPercent = calculateWellnessCompletion(revertedWellness);
        setCompletionPercentage(revertedCompletionPercent);
        
        throw dbError;
      }
    } catch (err) {
      console.error('Error toggling wellness activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle wellness activity');
      throw err;
    }
  }, [wellness]);

  // Note: addWellness function removed - activities are generated dynamically, not stored

  // Refresh activities at midnight for new day
  useEffect(() => {
    const checkNewDay = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      setTimeout(() => {
        loadWellnessActivities(); // Load new activities for the new day
        checkNewDay(); // Schedule next check
      }, msUntilMidnight);
    };
    
    checkNewDay();
  }, [loadWellnessActivities]);

  // Set up real-time subscription for completion changes
  useEffect(() => {
    let channel: any;
    
    const setupRealtimeSubscription = async () => {
      await loadWellnessActivities();
      
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to real-time changes in wellness_completions with user filtering
      channel = supabase
        .channel('wellness_completion_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'wellness_completions',
          filter: `user_id=eq.${user.id}`
        }, () => {
          loadWellnessActivities();
        })
        .subscribe();
    };
    
    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [loadWellnessActivities]);

  return {
    wellness,
    loading,
    error,
    completionPercentage,
    toggleWellness,
    refetch: loadWellnessActivities
  };
}
