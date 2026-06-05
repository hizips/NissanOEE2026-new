import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle } from 'lucide-react';
import type { DefectReason } from '@/types'; // Import your type

interface DefectCategorySelectorProps {
  defectReasons: DefectReason[]; // New prop
  machineId: string;           // New prop
  machineType: string;         // New prop
  partId: string;              // New prop
  value: {
    category: string;
    subcategory: string;
    specificReason?: string;
    comment?: string;
  } | null;
  onChange: (value: any) => void;
}

export function DefectCategorySelector({
  defectReasons,
  machineId,
  machineType,
  partId,
  value,
  onChange
}: DefectCategorySelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(value?.category || '');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(value?.subcategory || '');
  const [comment, setComment] = useState<string>(value?.comment || '');

  // Filter reasons based on current machine and part setup
  const availableReasons = useMemo(() => {
    return defectReasons.filter(reason => {
      if (!reason.active) return false;

      // Filter by Machine Type
      const matchesType = !reason.machineTypes ||
                         reason.machineTypes.length === 0 ||
                         reason.machineTypes.includes(machineType as any);

      // Filter by Specific Machine
      const matchesMachine = !reason.machineIds ||
                            reason.machineIds.length === 0 ||
                            reason.machineIds.includes(machineId);

      // Filter by Specific Part
      const matchesPart = !reason.partIds ||
                         reason.partIds.length === 0 ||
                         reason.partIds.includes(partId);

      return matchesType && matchesMachine && matchesPart;
    });
  }, [defectReasons, machineId, machineType, partId]);

  const categories = useMemo(() =>
    [...new Set(availableReasons.map(r => r.category))],
  [availableReasons]);

  const subcategories = useMemo(() =>
    availableReasons.filter(r => r.category === selectedCategory),
  [availableReasons, selectedCategory]);

    const [selectedReasonId, setSelectedReasonId] = useState<string>(() => {
      // Try to find the matching ID from the current value on load
      if (!value) return '';
      return defectReasons.find(r =>
        r.category === value.category &&
        r.subcategory === value.subcategory &&
        r.specificReason === value.specificReason
      )?.id || '';
    });

    const handleCategoryClick = (category: string) => {
      setSelectedCategory(category);
      setSelectedSubcategory('');
      setSelectedReasonId(''); // Clear ID when switching categories
      onChange(null);
    };

    const handleSubcategoryClick = (reason: DefectReason) => {
      setSelectedReasonId(reason.id); // Set the specific ID
      setSelectedSubcategory(reason.subcategory);
      onChange({
        category: reason.category,
        subcategory: reason.subcategory,
        specificReason: reason.specificReason,
        comment: comment || undefined,
      });
    };

  const handleCommentChange = (newComment: string) => {
    setComment(newComment);
    if (selectedCategory && selectedSubcategory) {
      onChange({
        category: selectedCategory,
        subcategory: selectedSubcategory,
        comment: newComment || undefined,
      });
    }
  };
    
    

  return (
    <div className="space-y-6">
      {/* Category Selection */}
      <Card className="border-2 border-orange-300">
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-xl">1. Select Defect Category</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {/* 1. Select Defect Category */}
          <div className="grid grid-cols-2 gap-4">
            {categories.map((category) => ( // Use dynamic 'categories' array
              <Button
                key={category}
                onClick={() => handleCategoryClick(category)}
                size="lg"
                variant={selectedCategory === category ? 'default' : 'outline'}
                className={`h-24 text-2xl font-bold ${
                  selectedCategory === category
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'border-2 border-orange-300 hover:bg-orange-50'
                }`}
              >
                {category}
                {selectedCategory === category && (
                  <Badge className="ml-3 bg-orange-900">Selected</Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subcategory Selection */}
      {selectedCategory && (
        <Card className="border-2 border-red-300 animate-in fade-in slide-in-from-top-4">
          <CardHeader className="bg-red-50">
            <CardTitle className="text-xl">
              2. Select {selectedCategory} Defect Type
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* 2. Select Defect Type */}
            <ScrollArea className="h-80">
              <div className="grid grid-cols-2 gap-3 pr-4">
                {subcategories.map((reason) => {
                  // Use the unique ID for the check
                  const isItemSelected = selectedReasonId === reason.id;

                  return (
                    <Button
                      key={reason.id}
                      onClick={() => handleSubcategoryClick(reason)}
                      size="lg"
                      variant={isItemSelected ? 'default' : 'outline'}
                      className={`h-20 text-lg font-semibold ${
                        isItemSelected
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'border-2 border-red-200 hover:bg-red-50 text-left justify-start px-4'
                      }`}
                    >
                      <div className="flex flex-col items-start leading-tight">
                        <span>{reason.subcategory}</span>
                        <span className="text-xs opacity-70 font-normal">{reason.specificReason}</span>
                      </div>
                      {isItemSelected && (
                        <Badge className="ml-auto bg-red-900">✓</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Optional Comment */}
      {selectedCategory && selectedSubcategory && (
        <Card className="border-2 border-blue-300 animate-in fade-in slide-in-from-top-4">
          <CardHeader className="bg-blue-50">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">3. Optional Comment</CardTitle>
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                Optional
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label htmlFor="defect-comment" className="text-base">
                Additional details or notes about this defect
              </Label>
              <Textarea
                id="defect-comment"
                value={comment}
                onChange={(e) => handleCommentChange(e.target.value)}
                placeholder="Enter any additional information (optional)..."
                className="min-h-24 text-lg"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selection Summary */}
      {selectedCategory && selectedSubcategory && (
        <Card className="border-2 border-green-300 bg-green-50 animate-in fade-in slide-in-from-top-4">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-green-700" />
              <div>
                <div className="font-semibold text-green-900 mb-1">Selected Defect Reason:</div>
                <div className="text-lg font-bold text-green-800">
                  {selectedCategory} → {selectedSubcategory}
                </div>
                {comment && (
                  <div className="text-sm text-green-700 mt-2">
                    Comment: "{comment}"
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
