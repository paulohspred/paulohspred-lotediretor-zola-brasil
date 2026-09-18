import Controller from '@ember/controller';

export default class PlanoDiretorController extends Controller {
  queryParams = ['imovel'];

  imovel = null;
}
