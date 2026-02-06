import React from 'react';
import { cn } from '@/lib/utils';

interface DeviceFrameProps {
    children: React.ReactNode;
    className?: string;
}

export function DeviceFrame({ children, className }: DeviceFrameProps) {
    return (
        <div className={cn("relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[3rem] h-[720px] w-[360px] shadow-2xl", className)}>
            {/* Top Speaker / Dynamic Island Area (Removed) */}
            {/* <div className="w-[120px] h-[28px] bg-black top-[14px] rounded-full left-1/2 -translate-x-1/2 absolute z-20 pointer-events-none"></div> */}

            {/* Side Buttons */}
            <div className="h-[32px] w-[3px] bg-gray-800 absolute -left-[17px] top-[72px] rounded-l-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[124px] rounded-l-lg"></div>
            <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[17px] top-[178px] rounded-l-lg"></div>
            <div className="h-[64px] w-[3px] bg-gray-800 absolute -right-[17px] top-[142px] rounded-r-lg"></div>

            {/* Screen Content */}
            <div className="rounded-[2rem] overflow-hidden w-full h-full bg-white dark:bg-gray-950 relative z-10">
                {children}
            </div>
        </div>
    );
}
