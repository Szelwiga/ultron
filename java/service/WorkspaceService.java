package com.doki.service;

import com.doki.dbs.UserDb;
import com.doki.dbs.WorkspaceDb;
import com.doki.proto.workspace.CreateWorkspaceRequest;
import com.doki.proto.workspace.CreateWorkspaceResponse;
import com.doki.proto.workspace.DeleteWorkspaceRequest;
import com.doki.proto.workspace.DeleteWorkspaceResponse;
import com.doki.proto.workspace.ListWorkspacesResponse;
import com.doki.proto.workspace.ManageCollaboratorRequest;
import com.doki.proto.workspace.ManageCollaboratorResponse;
import com.doki.proto.workspace.UpdateWorkspaceRequest;
import com.doki.proto.workspace.UpdateWorkspaceResponse;
import com.doki.proto.workspace.Workspace;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service managing workspaces, ownership limits, and collaborator access.
 */
public class WorkspaceService {
  public static final int MAX_OWNED_WORKSPACES = 10;
  private final WorkspaceDb workspaceDb;
  private final UserDb userDb;
  private final SecureRandom secureRandom = new SecureRandom();

  // Constructs WorkspaceService with workspace and user databases.
  public WorkspaceService(WorkspaceDb workspaceDb, UserDb userDb) {
    this.workspaceDb = workspaceDb;
    this.userDb = userDb;
  }

  // Returns all workspaces accessible by the user.
  public ListWorkspacesResponse listWorkspaces(String userEmail)
      throws IOException {
    List<Workspace> list = workspaceDb.listAccessibleByUser(userEmail);
    return ListWorkspacesResponse.newBuilder().addAllWorkspaces(list).build();
  }

  // Creates new workspace enforcing maximum ownership limit of 10.
  public CreateWorkspaceResponse createWorkspace(
      String ownerEmail, CreateWorkspaceRequest req) throws IOException {
    String name = req.getName().trim();
    if (name.isEmpty() || name.length() > 64) {
      return CreateWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Workspace name must be between 1 and 64 characters")
          .build();
    }

    int currentOwned = workspaceDb.countOwnedByUser(ownerEmail);
    if (currentOwned >= MAX_OWNED_WORKSPACES) {
      return CreateWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Cannot own more than 10 workspaces")
          .build();
    }

    String id = "ws_" + Long.toHexString(
        Math.abs(secureRandom.nextLong())).substring(0, 8);
    Workspace ws = Workspace.newBuilder()
        .setWorkspaceId(id)
        .setName(name)
        .setDescription(req.getDescription().trim())
        .setOwnerEmail(ownerEmail)
        .setIsPersonal(false)
        .build();

    workspaceDb.saveWorkspace(ws);
    return CreateWorkspaceResponse.newBuilder()
        .setSuccess(true)
        .setWorkspace(ws)
        .build();
  }

  // Ensures user has the undeletable Personal workspace upon registration.
  public void ensureDefaultWorkspace(String userEmail) throws IOException {
    List<Workspace> owned = workspaceDb.listAccessibleByUser(userEmail);
    boolean hasPersonal = owned.stream().anyMatch(w ->
        w.getIsPersonal() && w.getOwnerEmail().equalsIgnoreCase(userEmail));

    if (!hasPersonal) {
      String id = "ws_personal_" + Long.toHexString(
          Math.abs(secureRandom.nextLong())).substring(0, 6);
      Workspace ws = Workspace.newBuilder()
          .setWorkspaceId(id)
          .setName("Personal")
          .setDescription("Personal workspace (cannot be removed)")
          .setOwnerEmail(userEmail)
          .setIsPersonal(true)
          .build();
      workspaceDb.saveWorkspace(ws);
    }
  }

  // Updates name and description if caller is the owner.
  public UpdateWorkspaceResponse updateWorkspace(
      String userEmail, UpdateWorkspaceRequest req) throws IOException {
    Optional<Workspace> wsOpt = workspaceDb.findById(req.getWorkspaceId());
    if (wsOpt.isEmpty()) {
      return UpdateWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Workspace not found")
          .build();
    }

    Workspace ws = wsOpt.get();
    if (!ws.getOwnerEmail().equalsIgnoreCase(userEmail)) {
      return UpdateWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Only workspace owner can update workspace details")
          .build();
    }

    String name = req.getName().trim();
    if (name.isEmpty() || name.length() > 64) {
      return UpdateWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Workspace name must be between 1 and 64 characters")
          .build();
    }

    Workspace updated = ws.toBuilder()
        .setName(name)
        .setDescription(req.getDescription().trim())
        .build();
    workspaceDb.saveWorkspace(updated);

    return UpdateWorkspaceResponse.newBuilder()
        .setSuccess(true)
        .setWorkspace(updated)
        .build();
  }

  // Adds or removes collaborator emails validating registered user and owner status.
  public ManageCollaboratorResponse manageCollaborator(
      String userEmail, ManageCollaboratorRequest req) throws IOException {
    Optional<Workspace> wsOpt = workspaceDb.findById(req.getWorkspaceId());
    if (wsOpt.isEmpty()) {
      return ManageCollaboratorResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Workspace not found")
          .build();
    }

    Workspace ws = wsOpt.get();
    if (!ws.getOwnerEmail().equalsIgnoreCase(userEmail)) {
      return ManageCollaboratorResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Only owner can manage collaborators")
          .build();
    }

    String targetEmail = req.getCollaboratorEmail().trim().toLowerCase();
    if (targetEmail.isEmpty() || !targetEmail.contains("@")) {
      return ManageCollaboratorResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Invalid collaborator email")
          .build();
    }

    if (targetEmail.equalsIgnoreCase(ws.getOwnerEmail())) {
      return ManageCollaboratorResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("User is already the owner of this workspace")
          .build();
    }

    if (req.getAction() == ManageCollaboratorRequest.Action.ADD) {
      // Check if user is registered in the system
      if (userDb.findByEmail(targetEmail).isEmpty()) {
        return ManageCollaboratorResponse.newBuilder()
            .setSuccess(false)
            .setErrorMessage("No registered user found with email " + targetEmail)
            .build();
      }
    }

    List<String> collabs = new ArrayList<>(ws.getCollaboratorEmailsList());
    if (req.getAction() == ManageCollaboratorRequest.Action.ADD) {
      if (!collabs.contains(targetEmail)) {
        collabs.add(targetEmail);
      }
    } else {
      collabs.remove(targetEmail);
    }

    Workspace updated = ws.toBuilder()
        .clearCollaboratorEmails()
        .addAllCollaboratorEmails(collabs)
        .build();
    workspaceDb.saveWorkspace(updated);

    return ManageCollaboratorResponse.newBuilder()
        .setSuccess(true)
        .setWorkspace(updated)
        .build();
  }

  // Deletes workspace if caller is owner and not a personal workspace.
  public DeleteWorkspaceResponse deleteWorkspace(
      String userEmail, DeleteWorkspaceRequest req) throws IOException {
    Optional<Workspace> wsOpt = workspaceDb.findById(req.getWorkspaceId());
    if (wsOpt.isEmpty()) {
      return DeleteWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Workspace not found")
          .build();
    }

    Workspace ws = wsOpt.get();
    if (!ws.getOwnerEmail().equalsIgnoreCase(userEmail)) {
      return DeleteWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("Only owner can delete workspace")
          .build();
    }

    if (ws.getIsPersonal() || "Personal".equalsIgnoreCase(ws.getName())) {
      return DeleteWorkspaceResponse.newBuilder()
          .setSuccess(false)
          .setErrorMessage("The Personal workspace cannot be deleted")
          .build();
    }

    workspaceDb.deleteWorkspace(req.getWorkspaceId());
    return DeleteWorkspaceResponse.newBuilder()
        .setSuccess(true)
        .build();
  }
}
