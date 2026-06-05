const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Helper function for fetch to handle JSON parsing and errors.
 */
async function fetchClient(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = sessionStorage.getItem('oee-auth-token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorBody = await response.text();
    // If unauthorized, could automatically log out the user here
    if (response.status === 401) {
      sessionStorage.removeItem('oee-auth-token');
      sessionStorage.removeItem('oee-authenticated');
      // window.location.reload(); // Optional: force reload to login screen
    }
    throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Authentication API Endpoints
 */
export const authApi = {
  login: (credentials: any) => fetchClient('/auth/login/', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
};

/**
 * Generic API Factory
 */
const mapPayloadForBackend = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  const mapped = { ...data };

  // Map frontend relationship IDs to backend ForeignKey field names
  // and ensure they are integers (not strings)
  if ('machineId' in mapped) {
    mapped.machine = parseInt(mapped.machineId) || mapped.machineId;
    delete mapped.machineId;
  }
  if ('partId' in mapped) {
    mapped.part = mapped.partId ? parseInt(mapped.partId) || mapped.partId : null;
    delete mapped.partId;
  }
  if ('parentId' in mapped) {
    mapped.parent = mapped.parentId ? parseInt(mapped.parentId) || null : null;
    delete mapped.parentId;
  }

  // Remove read-only fields that the backend serializer will reject
  delete mapped.machineName;
  delete mapped.partName;
  delete mapped.machine_name;
  delete mapped.part_name;
  delete mapped.id; // Don't send id on create; on update it's in the URL

  // Map camelCase to snake_case for fields NOT handled by CamelCaseJSONParser
  // (CamelCaseJSONParser handles most, but we need explicit mapping for some)
  if ('supportedParts' in mapped) {
    mapped.supported_parts = mapped.supportedParts;
    delete mapped.supportedParts;
  }

  // Flatten downtime reason for backend
  if (mapped.reason && typeof mapped.reason === 'object') {
    mapped.reasonCategory = mapped.reason.category || '';
    mapped.reasonSubsystem = mapped.reason.subsystem || null;
    mapped.reasonComponent = mapped.reason.component || null;
    mapped.reasonSpecificItem = mapped.reason.specificItem || null;
    mapped.reasonFullPath = mapped.reason.fullPath || mapped.reason.category || '';
    delete mapped.reason;
  }

  return mapped;
};

const mapResponseForFrontend = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  const mapped = { ...data };

  // Always stringify the primary key so frontend comparisons work
  if ('id' in mapped && mapped.id !== undefined) {
    mapped.id = String(mapped.id);
  }
  if ('machine' in mapped && mapped.machine !== undefined) {
    mapped.machineId = String(mapped.machine);
    // don't delete mapped.machine, in case it's used elsewhere
  }
  if ('part' in mapped && mapped.part !== undefined) {
    mapped.partId = mapped.part ? String(mapped.part) : undefined;
  }
  if ('parent' in mapped) {
    mapped.parentId = mapped.parent ? String(mapped.parent) : undefined;
  }

  // Map many-to-many and other array relationship fields
  const ensureStringArray = (arr: any) => Array.isArray(arr) ? arr.map(String) : arr;

  if ('supported_parts' in mapped) mapped.supportedParts = ensureStringArray(mapped.supported_parts);
  if ('supportedParts' in mapped) mapped.supportedParts = ensureStringArray(mapped.supportedParts);

  if ('machine_types' in mapped) mapped.machineTypes = mapped.machine_types;
  if ('machine_ids' in mapped) mapped.machineIds = ensureStringArray(mapped.machine_ids);
  if ('machineIds' in mapped) mapped.machineIds = ensureStringArray(mapped.machineIds);

  if ('part_ids' in mapped) mapped.partIds = ensureStringArray(mapped.part_ids);
  if ('partIds' in mapped) mapped.partIds = ensureStringArray(mapped.partIds);

  if ('specific_reason' in mapped) mapped.specificReason = mapped.specific_reason;
  if ('requires_extra_field' in mapped) mapped.requiresExtraField = mapped.requires_extra_field;
  if ('extra_field_label' in mapped) mapped.extraFieldLabel = mapped.extra_field_label;
  if ('planned_production_time' in mapped) mapped.plannedProductionTime = mapped.planned_production_time;
  if ('counter_start' in mapped) mapped.counterStart = mapped.counter_start;
  if ('counter_end' in mapped) mapped.counterEnd = mapped.counter_end;
  if ('gross_count' in mapped) mapped.grossCount = mapped.gross_count;
  if ('excluded_shots' in mapped) mapped.excludedShots = mapped.excluded_shots;
  if ('net_production' in mapped) mapped.netProduction = mapped.net_production;
  if ('target_output' in mapped) mapped.targetOutput = mapped.target_output;
  if ('good_count' in mapped) mapped.goodCount = mapped.good_count;
  if ('defect_count' in mapped) mapped.defectCount = mapped.defect_count;
  if ('operator_name' in mapped) mapped.operatorName = mapped.operator_name;
  if ('downtime_events' in mapped) mapped.downtimeEvents = mapped.downtime_events;
  if ('machine_name' in mapped) mapped.machineName = mapped.machine_name;
  if ('part_name' in mapped) mapped.partName = mapped.part_name;

  // Restore nested downtime reason for frontend
  if ('reasonCategory' in mapped) {
    mapped.reason = {
      category: mapped.reasonCategory,
      subsystem: mapped.reasonSubsystem,
      component: mapped.reasonComponent,
      specificItem: mapped.reasonSpecificItem,
      fullPath: mapped.reasonFullPath || mapped.reasonCategory,
    };
  }

  return mapped;
};

const createCrudApi = (baseEndpoint: string) => ({
  getAll: async () => {
    const res = await fetchClient(baseEndpoint);
    return Array.isArray(res) ? res.map(mapResponseForFrontend) : res;
  },
  getById: async (id: string | number) => {
    const res = await fetchClient(`${baseEndpoint}${id}/`);
    return mapResponseForFrontend(res);
  },
  create: async (data: any) => {
    const res = await fetchClient(baseEndpoint, {
      method: 'POST',
      body: JSON.stringify(mapPayloadForBackend(data)),
    });
    return mapResponseForFrontend(res);
  },
  update: async (id: string | number, data: any) => {
    const res = await fetchClient(`${baseEndpoint}${id}/`, {
      method: 'PUT',
      body: JSON.stringify(mapPayloadForBackend(data)),
    });
    return mapResponseForFrontend(res);
  },
  patch: async (id: string | number, data: any) => {
    const res = await fetchClient(`${baseEndpoint}${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(mapPayloadForBackend(data)),
    });
    return mapResponseForFrontend(res);
  },
  delete: (id: string | number) => fetchClient(`${baseEndpoint}${id}/`, {
    method: 'DELETE',
  }),
});

export const machineApi = createCrudApi('/machines/');
export const operatorApi = createCrudApi('/operators/');
export const partApi = createCrudApi('/parts/');
export const dieApi = createCrudApi('/dies/');
export const defectReasonApi = createCrudApi('/defect-reasons/');
export const downtimeReasonApi = createCrudApi('/downtime-reasons/');
export const processReasonApi = createCrudApi('/process-reasons/');
export const scheduledDowntimeApi = createCrudApi('/scheduled-downtimes/');
export const partProductionHistoryApi = createCrudApi('/part-production-history/');
export const downtimeEventHistoryApi = createCrudApi('/downtime-event-history/');
export const productionRecordApi = createCrudApi('/records/');

/**
 * Creates a new Die in the database, then PATCHes the Part to include it.
 * Returns the updated Part from the server.
 */
export const addDieToPart = async (partId: string, currentDieIds: string[], dieName: string, dieNumber: string) => {
  // Step 1: Create the Die record
  const newDie = await fetchClient('/dies/', {
    method: 'POST',
    body: JSON.stringify({ name: dieName, die_number: dieNumber }),
  });

  const newDieId = String(newDie.id);

  // Step 2: PATCH the part with updated die_ids list
  const updatedPart = await fetchClient(`/parts/${partId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ die_ids: [...currentDieIds, newDieId] }),
  });

  return { die: mapResponseForFrontend(newDie), part: mapResponseForFrontend(updatedPart) };
};

/**
 * Removes a Die from a Part by PATCHing with the filtered die_ids list.
 * Returns the updated Part from the server.
 */
export const removeDieFromPart = async (partId: string, currentDieIds: string[], dieIdToRemove: string) => {
  const updatedPart = await fetchClient(`/parts/${partId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ die_ids: currentDieIds.filter(id => id !== dieIdToRemove) }),
  });
  return mapResponseForFrontend(updatedPart);
};

