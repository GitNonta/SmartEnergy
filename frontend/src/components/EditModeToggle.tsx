/**
 * Edit Mode Toggle Component
 * 
 * Floating button for admin users to toggle dashboard edit mode.
 * Shows edit/save/reset controls.
 */

import React from 'react';
import { Pencil, RotateCcw, X, Check, Loader2 } from 'lucide-react';
import { useDashboardLayout } from '../context/DashboardLayoutContext';
import { useLanguage } from '../context/LanguageContext';
import './EditModeToggle.css';

const EditModeToggle: React.FC = () => {
    const {
        isAdmin,
        isEditMode,
        isSaving,
        toggleEditMode,
        saveLayoutToServer,
        resetLayoutToDefault
    } = useDashboardLayout();
    const { t } = useLanguage();

    // Only show for admin users
    if (!isAdmin) {
        return null;
    }

    const handleSave = async () => {
        await saveLayoutToServer();
    };

    const handleReset = async () => {
        if (window.confirm(t('dashboard.confirmResetLayout') || 'Reset layout to default?')) {
            await resetLayoutToDefault();
        }
    };

    return (
        <div className={`edit-mode-toggle ${isEditMode ? 'editing' : ''}`}>
            {isEditMode ? (
                // Edit mode controls
                <div className="edit-controls">
                    <button
                        className="edit-btn reset-btn"
                        onClick={handleReset}
                        disabled={isSaving}
                        title={t('dashboard.resetLayout') || 'Reset to Default'}
                    >
                        <RotateCcw size={18} />
                    </button>
                    <button
                        className="edit-btn cancel-btn"
                        onClick={toggleEditMode}
                        disabled={isSaving}
                        title={t('dashboard.cancelEdit') || 'Cancel'}
                    >
                        <X size={18} />
                    </button>
                    <button
                        className="edit-btn save-btn"
                        onClick={handleSave}
                        disabled={isSaving}
                        title={t('dashboard.saveLayout') || 'Save Layout'}
                    >
                        {isSaving ? (
                            <Loader2 size={18} className="spinning" />
                        ) : (
                            <Check size={18} />
                        )}
                    </button>
                </div>
            ) : (
                // Toggle edit mode button
                <button
                    className="edit-btn toggle-btn"
                    onClick={toggleEditMode}
                    title={t('dashboard.editLayout') || 'Edit Layout'}
                >
                    <Pencil size={18} />
                </button>
            )}
        </div>
    );
};

export default EditModeToggle;
