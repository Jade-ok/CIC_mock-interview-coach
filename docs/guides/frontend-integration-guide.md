# Frontend Architecture History

An early prototype explored browser-side AWS service access through Cognito. The current design places AWS model access behind the Python runtime: `backend.local_server:app` during local development and managed backend services in the hosted architecture.

See `frontend-backend-wiring.md` for current local testing requirements and component contracts.
