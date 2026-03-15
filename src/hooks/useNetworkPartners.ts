import { useState, useEffect, useCallback, useRef } from "react";
import { NetworkPartner, NETWORK_PARTNERS } from "../data/networkPartners";
import { apiFetch } from "../utils/api";

export function useNetworkPartners() {
  const [partners, setPartners] = useState<NetworkPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedingAttempted = useRef(false);

  const seedPartners = async (seedData: NetworkPartner[]) => {
    if (seedingAttempted.current) return false;
    seedingAttempted.current = true;

    try {
      console.log(`Starting seed with ${seedData.length} partners...`);
      
      // Chunk the data to avoid payload size limits
      // Reduced chunk size to 5 to be very safe with Edge Function limits
      const CHUNK_SIZE = 5;
      const chunks = [];
      
      for (let i = 0; i < seedData.length; i += CHUNK_SIZE) {
        chunks.push(seedData.slice(i, i + CHUNK_SIZE));
      }
      
      let successCount = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          console.log(`Seeding chunk ${i + 1}/${chunks.length}...`);
          const response = await apiFetch(`/partners/seed`, {
            method: 'POST',
            body: JSON.stringify(chunk)
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Seeding chunk ${i + 1} failed: ${response.status} ${response.statusText}`, errorText);
          } else {
            successCount += chunk.length;
          }
        } catch (chunkError) {
          console.error(`Network error during seeding chunk ${i + 1}:`, chunkError);
        }
      }
      
      console.log(`Seeding complete. Successfully seeded ${successCount}/${seedData.length} partners.`);
      return successCount > 0;
    } catch (err) {
      console.error("Seeding process error:", err);
      return false;
    }
  };

  const fetchPartners = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Add a timestamp to prevent caching issues
      const response = await apiFetch(`/partners?t=${Date.now()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch partners: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        let data = result.data || [];
        
        // Auto-seeding logic
        if (data.length === 0 && NETWORK_PARTNERS && NETWORK_PARTNERS.length > 0) {
          console.log("Empty backend detected. Initiating seeding...");
          
          // Show local data immediately for better UX
          setPartners(NETWORK_PARTNERS);
          
          // Seed in background
          seedPartners(NETWORK_PARTNERS).then((seeded) => {
            if (seeded) {
              console.log("Seeding finished successfully. Data synced.");
            } else {
              console.warn("Seeding finished with errors or was skipped.");
            }
          });
          
        } else {
          setPartners(data);
        }
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (err) {
      console.error("Error in useNetworkPartners:", err);
      setError(String(err));
      // Fallback to local data on error to keep app usable
      if (NETWORK_PARTNERS) {
        console.log("Falling back to local data due to error.");
        setPartners(NETWORK_PARTNERS);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const savePartner = async (partnerData: Partial<NetworkPartner>) => {
    try {
      const isNew = !partnerData.id || partnerData.id.startsWith("new-");
      const method = isNew ? 'POST' : 'PUT';
      const path = isNew 
        ? `/partners` 
        : `/partners/${partnerData.id}`;

      // Optimistic update
      const tempId = partnerData.id || `temp-${Date.now()}`;
      const optimisticPartner = { ...partnerData, id: tempId } as NetworkPartner;
      
      setPartners(prev => {
        if (isNew) return [...prev, optimisticPartner];
        return prev.map(p => p.id === partnerData.id ? { ...p, ...partnerData } : p);
      });

      const response = await apiFetch(path, {
        method,
        body: JSON.stringify(partnerData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save partner: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Replace optimistic data with real server data
        setPartners(prev => {
          if (isNew) {
            return prev.map(p => p.id === tempId ? result.data : p);
          }
          return prev.map(p => p.id === result.data.id ? result.data : p);
        });
        return result.data;
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error("Error saving partner:", err);
      throw err;
    }
  };

  const deletePartner = async (id: string) => {
    try {
      // Optimistic update
      setPartners(prev => prev.filter(p => p.id !== id));

      const response = await apiFetch(`/partners/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }
    } catch (err) {
      console.error("Error deleting partner:", err);
      fetchPartners(); // Revert on error
      throw err;
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  return {
    partners,
    isLoading,
    error,
    refetch: fetchPartners,
    savePartner,
    deletePartner
  };
}
