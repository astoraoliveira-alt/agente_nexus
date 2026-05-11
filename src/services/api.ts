import { coreService } from './core.service';
import { dashboardService } from './dashboard.service';
import { usersService } from './users.service';
import { plansService } from './plans.service';
import { agentsService } from './agents.service';
import { conversationsService } from './conversations.service';
import { incidentsService } from './incidents.service';
import { systemIncidentsService } from './systemIncidents.service';
import { capabilitiesService } from './capabilities.service';
import { financialService } from './financial.service';
import { campaignsService } from './campaigns.service';
import { profilesService } from './profiles.service';
import { objectionsService } from './objections.service';

export const api = {
_capabilities: {
        conversations: true,
        resolver: true,
        agents: true
    },
...coreService,
...dashboardService,
...usersService,
...plansService,
...agentsService,
...conversationsService,
...incidentsService,
...systemIncidentsService,
...capabilitiesService,
...financialService,
...campaignsService,
...profilesService,
...objectionsService,
};
