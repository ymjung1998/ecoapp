const projectGrid = qs("#projectGrid");
const welcomeText = qs("#welcomeText");
const adminPageBtn = qs("#adminPageBtn");

async function loadProjectsPage() {
  try {
    hideMessage();
    bindLogoutButton();

    await requireAuth();
    const profile = await getCurrentProfile();

    welcomeText.textContent = `${profile.name}님, 참여할 프로젝트를 선택하세요.`;

    if (profile.role === "admin") {
      adminPageBtn.classList.remove("hidden");
      adminPageBtn.addEventListener("click", () => {
        window.location.href = "./admin.html";
      });
    }

    const { data, error } = await window.sb
      .from("projects")
      .select("*")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) throw error;

    renderProjects(data || []);
  } catch (error) {
    showMessage(error.message || "프로젝트를 불러오지 못했습니다.", "error");
  }
}

function renderProjects(projects) {
  if (!projects.length) {
    projectGrid.innerHTML = `<div class="project-card"><p>활성화된 프로젝트가 없습니다.</p></div>`;
    return;
  }

  projectGrid.innerHTML = projects.map(project => `
    <article class="project-card">
      <div class="status-badge">활성 프로젝트</div>
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.description || "설명 없음")}</p>
      <button class="primary-btn select-project-btn" type="button" data-id="${project.id}">
        이 프로젝트 선택
      </button>
    </article>
  `).join("");

  qsa(".select-project-btn").forEach(button => {
    button.addEventListener("click", () => {
      setSelectedProjectId(button.dataset.id);
      window.location.href = "./my-photos.html";
    });
  });
}

loadProjectsPage();