from enum import Enum

class UserRole(str, Enum):
    VIEWER = "viewer"
    EDITOR = "editor"
    OWNER = "owner"